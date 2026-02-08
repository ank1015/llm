/**
 * Markdown parsing and serialization with YAML frontmatter.
 * Uses gray-matter for frontmatter extraction.
 */

import matter from 'gray-matter';

import type { Note, NoteFrontmatter } from './note.types.js';

/** Parse a markdown string with YAML frontmatter into a Note */
export function parseNote(slug: string, raw: string): Note {
  const { data, content } = matter(raw);
  const frontmatter = data as NoteFrontmatter;
  return { slug, frontmatter, content: content.trim() };
}

/** Serialize a Note back to a markdown string with YAML frontmatter */
export function serializeNote(frontmatter: NoteFrontmatter, content: string): string {
  return matter.stringify(content, frontmatter);
}

/** Generate a URL-safe slug from a title */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
