import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const inputDir = path.resolve(projectRoot, process.argv[2] ?? 'src/content/posts');
const outputDir = path.resolve(projectRoot, process.argv[3] ?? 'src/content/tts-text');

const speechReplacements = [
  [/SGLang/g, 'S-G-Lang'],
  [/GPT-OSS/g, 'G-P-T O-S-S'],
  [/\bLLMs\b/g, 'L-L-Ms'],
  [/\bLLM\b/g, 'L-L-M'],
  [/\bGPUs\b/g, 'G-P-Us'],
  [/\bGPU\b/g, 'G-P-U'],
  [/\bCPUs\b/g, 'C-P-Us'],
  [/\bCPU\b/g, 'C-P-U'],
  [/\bMFU\b/g, 'M-F-U'],
  [/\bHBM\b/g, 'H-B-M'],
  [/\bMLX\b/g, 'M-L-X'],
  [/\bOSS\b/g, 'O-S-S'],
  [/\bRISC-V\b/g, 'RISC V'],
  [/\bRDNA4\b/g, 'R-D-N-A 4'],
  [/\bSIMT\b/g, 'S-I-M-T'],
  [/\bGSoC\b/g, 'G-Soc'],
  [/\bOpenXLA\b/g, 'Open X L A'],
  [/\bRISCV\b/g, 'RISC V'],
];

function stripFrontmatter(source) {
  if (!source.startsWith('---')) {
    return { frontmatter: {}, body: source };
  }

  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: source };
  }

  const frontmatterText = match[1];
  const frontmatter = {};

  for (const line of frontmatterText.split('\n')) {
    const field = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!field) continue;
    const [, key, rawValue] = field;
    frontmatter[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }

  return {
    frontmatter,
    body: source.slice(match[0].length),
  };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&mdash;/g, ' - ')
    .replace(/&ndash;/g, ' - ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function cleanInline(text) {
  let next = decodeHtmlEntities(text);

  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) => alt ? `Image caption: ${alt}` : 'Image');
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  next = next.replace(/`([^`]+)`/g, '$1');
  next = next.replace(/\*\*([^*]+)\*\*/g, '$1');
  next = next.replace(/\*([^*]+)\*/g, '$1');
  next = next.replace(/_([^_]+)_/g, '$1');
  next = next.replace(/[*]/g, '');
  next = next.replace(/<br\s*\/?>/gi, '\n');
  next = next.replace(/<\/?[^>]+>/g, '');
  next = next.replace(/[⚡🤥😁😂]/g, '');

  for (const [pattern, replacement] of speechReplacements) {
    next = next.replace(pattern, replacement);
  }

  next = next.replace(/\s+/g, ' ').trim();
  return next;
}

function transformTwitterEmbed(match) {
  const inner = match.replace(/<script[\s\S]*?<\/script>/gi, '');
  const paragraphMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const authorMatch = inner.match(/&mdash;\s*([^<]+?)\s*\(/i);
  const dateMatch = inner.match(/>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*</);

  const rawText = paragraphMatch?.[1] ?? '';
  const text = cleanInline(
    rawText
      .replace(/<a [^>]*>[^<]*<\/a>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
  );

  const parts = [];
  if (authorMatch?.[1]) {
    parts.push(`Embedded social post by ${cleanInline(authorMatch[1])}:`);
  } else {
    parts.push('Embedded social post:');
  }
  if (text) {
    parts.push(text);
  }
  if (dateMatch?.[1]) {
    parts.push(`Posted on ${dateMatch[1]}.`);
  }

  return `\n\n${parts.join(' ')}\n\n`;
}

function transformBlockquotes(source) {
  return source.replace(/(^|\n)((?:>.*\n?)+)/g, (_, prefix, quoteBlock) => {
    const lines = quoteBlock
      .split('\n')
      .map((line) => line.replace(/^>\s?/, '').trim())
      .filter(Boolean);

    if (!lines.length) return prefix;

    const authorIndex = lines.findIndex((line) => /^[-—]{2,}\s*/.test(line));
    if (authorIndex >= 0) {
      const quote = lines.slice(0, authorIndex).join(' ');
      const author = lines[authorIndex].replace(/^[-—]{2,}\s*/, '');
      return `${prefix}\nQuote by ${cleanInline(author)}: ${cleanInline(quote)}\n`;
    }

    return `${prefix}\nQuote: ${cleanInline(lines.join(' '))}\n`;
  });
}

function transformImages(source) {
  return source.replace(/<Image\s+[^>]*label="([^"]+)"[^>]*\/>/g, (_, label) => {
    return `\n\nImage caption: ${cleanInline(label)}\n\n`;
  });
}

function transformCodeFences(source) {
  return source.replace(/```[\w-]*\n([\s\S]*?)```/g, (_, code) => {
    const cleaned = code
      .split('\n')
      .map((line) => cleanInline(line))
      .filter(Boolean)
      .join('. ');

    return cleaned ? `\n\nCode example: ${cleaned}\n\n` : '\n\n';
  });
}

function transformHtmlBlocks(source) {
  let next = source;
  next = next.replace(/<blockquote class="twitter-tweet">[\s\S]*?<\/blockquote>\s*<script[\s\S]*?<\/script>/gi, transformTwitterEmbed);
  return next;
}

function transformListsAndHeadings(source) {
  return source
    .split('\n')
    .map((line) => {
      if (/^\s*import\s+/.test(line)) return '';
      if (/^\s*#/.test(line)) return `\nSection: ${cleanInline(line.replace(/^#+\s*/, ''))}\n`;
      if (/^\s*-\s+/.test(line)) return `- ${cleanInline(line.replace(/^\s*-\s+/, ''))}`;
      if (/^\s*\d+\.\s+/.test(line)) return `${line.match(/^\s*(\d+\.)/)?.[1] ?? '1.'} ${cleanInline(line.replace(/^\s*\d+\.\s+/, ''))}`;
      return line;
    })
    .join('\n');
}

function finalizeText(text) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' '))
    .map((block) => cleanInline(block))
    .filter(Boolean);

  return `${paragraphs.join('\n\n')}\n`;
}

function convertPostToTtsText(source) {
  const { frontmatter, body } = stripFrontmatter(source);

  let text = body;
  text = transformImages(text);
  text = transformHtmlBlocks(text);
  text = transformCodeFences(text);
  text = transformBlockquotes(text);
  text = transformListsAndHeadings(text);

  const header = [];
  if (frontmatter.title) header.push(frontmatter.title);
  if (frontmatter.description) header.push(frontmatter.description);

  return finalizeText(`${header.join('\n\n')}\n\n${text}`);
}

async function main() {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const postFiles = entries
    .filter((entry) => entry.isFile() && /\.(md|mdx)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const fileName of postFiles) {
    const inputPath = path.join(inputDir, fileName);
    const outputPath = path.join(outputDir, `${fileName.replace(/\.(md|mdx)$/, '')}.txt`);
    const source = await readFile(inputPath, 'utf8');
    const text = convertPostToTtsText(source);
    await writeFile(outputPath, text, 'utf8');
  }

  console.log(`Exported ${postFiles.length} post text file(s) to ${outputDir}`);
}

await main();
