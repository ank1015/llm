import { setupSkills } from './agents/skills/index.js';

const test = async () => {
  console.log('Starting');
  await setupSkills('/Users/notacoder/Desktop/test');
  console.log('Ending');
};

test();
