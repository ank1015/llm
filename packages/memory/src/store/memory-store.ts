/**
 * MemoryStore — core class that orchestrates note CRUD,
 * metadata indexing, and semantic search.
 */

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { chunkByHeadings } from '../search/chunker.js';
import { OpenAIEmbedder } from '../search/embedder.js';
import { MetadataIndex } from '../search/metadata-index.js';
import { SemanticIndex } from '../search/semantic-index.js';

import { parseNote, serializeNote, slugify } from './markdown.js';

import type {
  MemoryStoreConfig,
  Note,
  NoteFilter,
  NoteSummary,
  SearchResult,
} from './note.types.js';
import type { Embedder } from '../search/embedder.js';

const DEFAULT_NOTES_DIR = `${process.env['HOME'] ?? '~'}/.llm/memory/notes`;

export class MemoryStore {
  private readonly notesDir: string;
  private readonly metadataIndex: MetadataIndex;
  private readonly semanticIndex: SemanticIndex;
  private initialized = false;

  constructor(config: MemoryStoreConfig = {}) {
    this.notesDir = config.notesDir ?? DEFAULT_NOTES_DIR;
    const apiKey = config.openaiApiKey ?? process.env['OPENAI_API_KEY'];
    const embedder: Embedder = new OpenAIEmbedder(apiKey ?? '');

    this.metadataIndex = new MetadataIndex(join(this.notesDir, '.metadata-index.json'));
    this.semanticIndex = new SemanticIndex(join(this.notesDir, '.semantic-index.json'), embedder);
  }

  /** Ensure notes directory exists and indexes are loaded */
  private async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.notesDir, { recursive: true });
    await this.metadataIndex.load();
    await this.semanticIndex.load();
    this.initialized = true;
  }

  async saveNote(title: string, content: string, tags: string[], source?: string): Promise<Note> {
    await this.init();

    const slug = slugify(title);
    const date = new Date().toISOString().slice(0, 10);
    const frontmatter = { title, tags, date, ...(source ? { source } : {}) };
    const markdown = serializeNote(frontmatter, content);

    await writeFile(join(this.notesDir, `${slug}.md`), markdown, 'utf-8');

    // Update metadata index
    this.metadataIndex.upsert({ slug, title, tags, date, source });
    await this.metadataIndex.save();

    // Update semantic index — remove old chunks, add new ones
    this.semanticIndex.removeBySlug(slug);
    const chunks = chunkByHeadings(slug, content);
    await this.semanticIndex.addChunks(chunks);
    await this.semanticIndex.save();

    return { slug, frontmatter: { title, tags, date, source }, content };
  }

  async getNote(slug: string): Promise<Note> {
    await this.init();

    const filePath = join(this.notesDir, `${slug}.md`);
    const raw = await readFile(filePath, 'utf-8');
    return parseNote(slug, raw);
  }

  async listNotes(filter?: NoteFilter): Promise<NoteSummary[]> {
    await this.init();

    if (filter && (filter.tags || filter.query)) {
      return this.metadataIndex.filter(filter);
    }
    return this.metadataIndex.getAll();
  }

  async search(query: string, tags?: string[], limit?: number): Promise<SearchResult[]> {
    await this.init();
    const maxResults = limit ?? 10;

    // If only tags, do metadata filter
    if (!query && tags && tags.length > 0) {
      const summaries = this.metadataIndex.filter({ tags });
      return summaries.map((s) => ({
        slug: s.slug,
        heading: s.title,
        text: '',
        score: 1,
      }));
    }

    // Semantic search
    let results = await this.semanticIndex.search(query, maxResults);

    // If tags provided, filter semantic results to only matching slugs
    if (tags && tags.length > 0) {
      const matchingSlugs = new Set(this.metadataIndex.filter({ tags }).map((s) => s.slug));
      results = results.filter((r) => matchingSlugs.has(r.slug));
    }

    return results.slice(0, maxResults);
  }

  async rebuildIndex(): Promise<void> {
    this.initialized = false;
    await mkdir(this.notesDir, { recursive: true });

    // Reset indexes
    const metaIndex = this.metadataIndex;
    const semIndex = this.semanticIndex;

    // Read all markdown files
    const files = await readdir(this.notesDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    for (const file of mdFiles) {
      const slug = file.replace(/\.md$/, '');
      const raw = await readFile(join(this.notesDir, file), 'utf-8');
      const note = parseNote(slug, raw);

      metaIndex.upsert({
        slug,
        title: note.frontmatter.title,
        tags: note.frontmatter.tags,
        date: note.frontmatter.date,
        source: note.frontmatter.source,
      });

      const chunks = chunkByHeadings(slug, note.content);
      await semIndex.addChunks(chunks);
    }

    await metaIndex.save();
    await semIndex.save();
    this.initialized = true;
  }
}
