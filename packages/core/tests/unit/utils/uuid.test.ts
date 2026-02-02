import { describe, expect, it } from 'vitest';

import { generateUUID } from '../../../src/utils/uuid.js';

describe('generateUUID', () => {
  describe('format', () => {
    it('should return a string', () => {
      const uuid = generateUUID();

      expect(typeof uuid).toBe('string');
    });

    it('should return a valid UUID v4 format', () => {
      const uuid = generateUUID();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      // where x is any hex digit and y is 8, 9, a, or b
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidV4Regex);
    });

    it('should have correct length (36 characters)', () => {
      const uuid = generateUUID();

      expect(uuid.length).toBe(36);
    });

    it('should have hyphens in correct positions', () => {
      const uuid = generateUUID();

      expect(uuid[8]).toBe('-');
      expect(uuid[13]).toBe('-');
      expect(uuid[18]).toBe('-');
      expect(uuid[23]).toBe('-');
    });

    it('should have version 4 indicator', () => {
      const uuid = generateUUID();

      // The 13th character (after removing hyphens) should be '4'
      expect(uuid[14]).toBe('4');
    });

    it('should have valid variant bits', () => {
      const uuid = generateUUID();

      // The 17th character (after removing first two hyphens) should be 8, 9, a, or b
      const variantChar = uuid[19].toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });

  describe('uniqueness', () => {
    it('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();

      expect(uuid1).not.toBe(uuid2);
    });

    it('should generate unique UUIDs in bulk', () => {
      const uuids = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        uuids.add(generateUUID());
      }

      expect(uuids.size).toBe(count);
    });

    it('should not generate duplicate UUIDs in rapid succession', () => {
      const uuids: string[] = [];

      for (let i = 0; i < 100; i++) {
        uuids.push(generateUUID());
      }

      const uniqueUuids = new Set(uuids);
      expect(uniqueUuids.size).toBe(uuids.length);
    });
  });

  describe('consistency', () => {
    it('should always return lowercase hex characters', () => {
      // Generate multiple UUIDs to ensure consistent casing
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        const hexPart = uuid.replace(/-/g, '');

        // All characters should be lowercase hex
        expect(hexPart).toMatch(/^[0-9a-f]+$/);
      }
    });

    it('should be a pure function with no side effects', () => {
      // Calling generateUUID should not affect subsequent calls
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      const uuid3 = generateUUID();

      // All should be valid and different
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid1).toMatch(uuidRegex);
      expect(uuid2).toMatch(uuidRegex);
      expect(uuid3).toMatch(uuidRegex);
      expect(new Set([uuid1, uuid2, uuid3]).size).toBe(3);
    });
  });
});
