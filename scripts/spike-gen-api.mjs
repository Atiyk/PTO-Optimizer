import { writeFileSync } from 'node:fs';
writeFileSync(new URL('../api/gen.mjs', import.meta.url), "export default { fetch() { return new Response('generated at build'); } };\n");
