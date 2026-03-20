import { describe, expect, it } from 'vitest';

import {
  findGoogleSelectOptionMatch,
  isGoogleSearchPaginationUrl,
  parseGoogleSearchCliArgs,
  pickGoogleSearchNextPageCandidate,
  renderGoogleSearchMarkdown,
  resolveGoogleSearchOptions,
  selectOrganicGoogleSearchResults,
} from '../../src/helpers/web/scripts/google/search.js';

import type {
  GoogleSearchCandidateBlock,
  GoogleSearchNextPageCandidate,
  GoogleSelectOption,
} from '../../src/helpers/web/scripts/google/search.js';

describe('google search helpers', () => {
  it('matches select options by value or label', () => {
    const options: GoogleSelectOption[] = [
      { value: '', label: 'any language' },
      { value: 'lang_en', label: 'English' },
      { value: 'lang_hi', label: 'Hindi' },
    ];

    expect(findGoogleSelectOptionMatch(options, 'lang_en')).toEqual({
      value: 'lang_en',
      label: 'English',
    });
    expect(findGoogleSelectOptionMatch(options, ' english ')).toEqual({
      value: 'lang_en',
      label: 'English',
    });
    expect(findGoogleSelectOptionMatch(options, 'missing')).toBeUndefined();
  });

  it('resolves search options and normalizes inputs', () => {
    expect(
      resolveGoogleSearchOptions({
        allWords: ['openai', 'agents'],
        anyWords: ['sdk', 'browser'],
        noneWords: ['ads'],
        minNumber: 10,
        maxNumber: 20,
        siteOrDomain: 'openai.com',
        language: 'English',
        count: 3.8,
        launch: false,
      })
    ).toEqual({
      allWords: 'openai agents',
      exactPhrase: '',
      anyWords: 'sdk browser',
      noneWords: 'ads',
      minNumber: '10',
      maxNumber: '20',
      language: 'English',
      region: undefined,
      lastUpdate: undefined,
      siteOrDomain: 'openai.com',
      termsAppearing: undefined,
      fileType: undefined,
      usageRights: undefined,
      count: 3,
      launch: false,
    });
  });

  it('parses google search cli flags', () => {
    expect(
      parseGoogleSearchCliArgs([
        '--query',
        'openai agents',
        '--site',
        'openai.com',
        '--language',
        'English',
        '--region=countryIN',
        '--last-update',
        'd',
        '--count',
        '5',
        '--no-launch',
      ])
    ).toEqual({
      allWords: 'openai agents',
      exactPhrase: '',
      anyWords: '',
      noneWords: '',
      minNumber: '',
      maxNumber: '',
      language: 'English',
      region: 'countryIN',
      lastUpdate: 'd',
      siteOrDomain: 'openai.com',
      count: 5,
      launch: false,
    });
  });

  it('filters sponsored blocks, internal Google blocks, and duplicates', () => {
    const candidates: GoogleSearchCandidateBlock[] = [
      {
        index: 0,
        title: 'OpenAI',
        rawHref: 'https://openai.com/',
        resolvedHref: 'https://openai.com/',
        siteName: 'OpenAI',
        displayUrl: 'https://openai.com',
        snippet: 'Official site',
        text: 'OpenAI https://openai.com Official site',
      },
      {
        index: 1,
        title: '',
        rawHref: 'https://www.google.com/search?q=OpenAI+pricing',
        resolvedHref: 'https://www.google.com/search?q=OpenAI+pricing',
        siteName: null,
        displayUrl: null,
        snippet: null,
        text: 'Ads Find related products & services OpenAI pricing',
      },
      {
        index: 2,
        title: 'OpenAI',
        rawHref: 'https://www.linkedin.com/company/openai',
        resolvedHref: 'https://www.linkedin.com/company/openai',
        siteName: 'LinkedIn',
        displayUrl: 'https://www.linkedin.com/company/openai',
        snippet: 'Sponsored listing',
        text: 'OpenAI LinkedIn Sponsored listing',
      },
      {
        index: 3,
        title: '',
        rawHref: null,
        resolvedHref: null,
        siteName: null,
        displayUrl: null,
        snippet: null,
        text: '',
      },
      {
        index: 4,
        title: 'OpenAI',
        rawHref: 'https://en.wikipedia.org/wiki/OpenAI',
        resolvedHref: 'https://en.wikipedia.org/wiki/OpenAI',
        siteName: 'Wikipedia',
        displayUrl: 'https://en.wikipedia.org/wiki/OpenAI',
        snippet: 'Wikipedia summary',
        text: 'OpenAI Wikipedia summary',
      },
      {
        index: 5,
        title: 'OpenAI',
        rawHref: 'https://openai.com/',
        resolvedHref: 'https://openai.com/',
        siteName: 'OpenAI',
        displayUrl: 'https://openai.com',
        snippet: 'Duplicate official site',
        text: 'OpenAI duplicate official site',
      },
    ];

    expect(selectOrganicGoogleSearchResults(candidates)).toEqual([
      {
        index: 0,
        title: 'OpenAI',
        url: 'https://openai.com/',
        siteName: 'OpenAI',
        displayUrl: 'https://openai.com',
        snippet: 'Official site',
        textSnippet: 'OpenAI https://openai.com Official site',
      },
      {
        index: 1,
        title: 'OpenAI',
        url: 'https://en.wikipedia.org/wiki/OpenAI',
        siteName: 'Wikipedia',
        displayUrl: 'https://en.wikipedia.org/wiki/OpenAI',
        snippet: 'Wikipedia summary',
        textSnippet: 'OpenAI Wikipedia summary',
      },
    ]);
  });

  it('prefers the real Google pager over unrelated next controls', () => {
    const candidates: GoogleSearchNextPageCandidate[] = [
      {
        id: null,
        text: '54:12 Advice for the Next Gen of Engineers',
        ariaLabel: 'From 54 minutes, 12 seconds, Advice for the Next Gen of Engineers. 17 of 20.',
        href: 'https://www.youtube.com/watch?v=S1rQngjpUdI&t=3252',
        inResultsFooter: false,
        inNavigationRegion: false,
        inPaginationTable: false,
      },
      {
        id: 'pnnext',
        text: 'Next',
        ariaLabel: null,
        href: 'https://www.google.com/search?q=openai+codex&start=10&sa=N',
        inResultsFooter: true,
        inNavigationRegion: false,
        inPaginationTable: true,
      },
    ];

    expect(
      pickGoogleSearchNextPageCandidate(candidates, 'https://www.google.com/search?q=openai+codex')
    ).toEqual(candidates[1]);
  });

  it('only treats Google search pagination URLs as next-page links', () => {
    expect(
      isGoogleSearchPaginationUrl(
        'https://www.google.com/search?q=openai+codex&start=10&sa=N',
        'https://www.google.com/search?q=openai+codex'
      )
    ).toBe(true);
    expect(
      isGoogleSearchPaginationUrl(
        'https://www.google.com/search?q=openai+codex',
        'https://www.google.com/search?q=openai+codex'
      )
    ).toBe(false);
    expect(
      isGoogleSearchPaginationUrl(
        'https://www.youtube.com/watch?v=S1rQngjpUdI&t=3252',
        'https://www.google.com/search?q=openai+codex'
      )
    ).toBe(false);
  });

  it('renders a readable markdown summary with the saved JSON path', () => {
    const markdown = renderGoogleSearchMarkdown(
      {
        status: 'ok',
        page: {
          title: 'openai - Google Search',
          url: 'https://www.google.com/search?as_q=openai',
          route: '/search?as_q=openai',
        },
        query: {
          allWords: 'openai',
          exactPhrase: '',
          anyWords: '',
          noneWords: '',
          minNumber: '',
          maxNumber: '',
          siteOrDomain: 'openai.com',
        },
        selectedOptions: {
          language: {
            requested: 'English',
            value: 'lang_en',
            label: 'English',
          },
        },
        requestedCount: 3,
        collectedCount: 2,
        pagesVisited: 1,
        resultStats: 'About 12,300 results (0.22s)',
        results: [
          {
            index: 0,
            title: 'OpenAI',
            url: 'https://openai.com/',
            siteName: 'OpenAI',
            displayUrl: 'https://openai.com',
            snippet: 'Official site',
            textSnippet: 'Official site',
          },
          {
            index: 1,
            title: 'ChatGPT',
            url: 'https://chatgpt.com/',
            siteName: 'ChatGPT',
            displayUrl: 'https://chatgpt.com',
            snippet: 'ChatGPT site',
            textSnippet: 'ChatGPT site',
          },
        ],
      },
      '/tmp/google-search.json'
    );

    expect(markdown).toContain('# Google Search');
    expect(markdown).toContain('Raw JSON saved to: `/tmp/google-search.json`');
    expect(markdown).toContain('Collected organic results: 2');
    expect(markdown).toContain('Language: English (lang_en)');
    expect(markdown).toContain('**OpenAI**');
    expect(markdown).toContain('Sponsored results were skipped.');
  });
});
