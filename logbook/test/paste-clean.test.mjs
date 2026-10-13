// Paste cleaner (paste-clean.js): rich text (HTML) from web pages, Word, Google Docs, OneNote and UpNote to light
// Markdown, and tidying Markdown already in a note. Fake text only.
import assert from 'node:assert/strict';
import { htmlToMarkdown, tidyMarkdown, decodeEntities, normaliseChars } from '../js/paste-clean.js';
import { parseNote } from '../js/notepad.js';

// entities and odd characters
assert.equal(decodeEntities('a&nbsp;b &amp; &lt;c&gt; &#8217; &#x2014; &unknown;'), 'a b & <c> ’ — &unknown;');
assert.equal(normaliseChars('“quoted” ‘x’ y​'), '"quoted" \'x\' y');

// Google Docs: the outer <b style="font-weight:normal"> isn't bold; spans carry bold and italic
assert.equal(htmlToMarkdown('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Plan</span><span> for </span><span style="font-style:italic">today</span></p><ul><li><p>One&nbsp;thing</p></li><li><p>Two <a href="https://example.com">docs</a></p></li></ul></b>'),
  '**Plan** for *today*\n\n- One thing\n- Two [docs](https://example.com)');

// headings, paragraphs, smart quotes, marks with spaces inside, empty marks, nested and numbered lists
assert.equal(htmlToMarkdown('<h1>Title</h1><h4>Small</h4><p>Para “quoted” <strong> bold </strong>end.</p><p></p><p><em></em>x</p><ol start="3"><li>a<ul><li>b</li></ul></li><li>c</li></ol>'),
  '# Title\n\n### Small\n\nPara "quoted" **bold** end.\n\nx\n\n3. a\n  - b\n4. c');

// tables become pipe tables; divs (Gmail, Keep) are lines; <br> is a line break
assert.equal(htmlToMarkdown('<table><tr><th>Drug</th><th>Dose</th></tr><tr><td>Fake A</td><td><p>1 mg</p></td></tr></table><div>line1</div><div>line2<br>line3</div>'),
  '| Drug | Dose |\n| --- | --- |\n| Fake A | 1 mg |\n\nline1\nline2\nline3');

// to-do boxes; nested bold in italic; unsafe links lose the link, keep the words
assert.equal(htmlToMarkdown('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul><i><b>x</b></i> <a href="javascript:alert(1)">bad</a>'),
  '- [x] done\n- [ ] todo\n\n***x*** bad');

// Word: Office tags, list symbols in spans, scripts and styles dropped; the clipboard's fragment markers honoured
assert.equal(htmlToMarkdown('<html><head><style>p{color:red}</style></head><body><!--StartFragment--><p class=MsoListParagraph><span>·<span>&nbsp;&nbsp;&nbsp; </span></span>Item<o:p></o:p></p><script>alert(1)</script><!--EndFragment--></body></html>'), '- Item');

// a link whose words are its address stays a bare address; a bold link loses the stars inside the brackets
assert.equal(htmlToMarkdown('<a href="https://example.org/x">https://example.org/x</a>'), 'https://example.org/x');
assert.equal(htmlToMarkdown('<a href="https://example.org"><b>Fake site</b></a>'), '[Fake site](https://example.org)');
// plain words and stray < survive; nothing is HTML any more
assert.equal(htmlToMarkdown('2 < 3 and <span>4 &gt; 1</span>'), '2 < 3 and 4 > 1');
assert.equal(htmlToMarkdown(''), '');

// what comes out reads in the note's preview: a heading, a list with a to-do
const blocks = parseNote(htmlToMarkdown('<h2>Fake list</h2><ul><li><input type="checkbox"> read</li></ul>'));
assert.deepEqual(blocks.map(b => b.t), ['h', 'ul']);
assert.equal(blocks[1].items[0].check, false);

// tidying Markdown already pasted (UpNote / OneNote leftovers)
assert.equal(tidyMarkdown('1\\. one\n\n2\\. two\n**  **\n• bullet\nword  word **bold **x\n- []  box\n☐ todo\n☑ done\n\n\n\nend  '),
  '1. one\n2. two\n- bullet\nword word **bold** x\n- [ ] box\n- [ ] todo\n- [x] done\n\nend');
assert.equal(tidyMarkdown('**a** b **c**'), '**a** b **c**');                 // nothing to change
assert.equal(tidyMarkdown('**  lead** and **trail  **'), '**lead** and **trail**');
assert.equal(tidyMarkdown('  - nested  item'), '  - nested item');            // the indent of a nested list stays
assert.equal(tidyMarkdown('para one\n\n  \n\npara two'), 'para one\n\npara two');
assert.equal(tidyMarkdown('a\r\nb\\_c'), 'a\nb_c');

console.log('paste-clean tests passed');
