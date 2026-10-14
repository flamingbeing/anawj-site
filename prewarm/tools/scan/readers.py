"""Who reads a handwritten crop. Each reader returns {'text': str, 'legible': bool}. The tool asks twice, with
different framing and scale, and only trusts a value when both reads agree."""
import base64, json, os, re

PROMPT_A = ('This is a cropped cell from a printed anaesthesia study data sheet, photographed with a phone. '
            'Field: "{label}"{unit}. Expected: {expect}. Printed text (labels, units, lines, tick boxes) may be visible: '
            'read ONLY the handwritten entry. Reply with JSON only: {{"text": "<what is written>", "legible": true|false}}. '
            'Read the entry in the middle of the image; digits cut off at the edges belong to a neighbouring cell. Use digits, and "." or ":" if written, and a leading minus sign if there is one. A cell with no handwriting is {{"text": "", "legible": true}}. If the cell holds only an arrow, a long vertical line or a ditto mark ("same as above"), reply {{"text": "ARROW", "legible": true}}. If a number is struck through and rewritten, read the rewritten one and set legible to false. '
            'If you are not certain of every digit set legible to false and still give your best reading. Do not guess from context.')
PROMPT_B = ('Transcribe the handwriting in this image digit by digit. It is one entry for "{label}"{unit} ({expect}); '
            'ignore anything printed. Return JSON only: {{"text": "...", "legible": true|false}}. Empty if nothing is written. '
            'legible=false if any character could be read two ways.')


def _expect(f):
    if f.get('opts'):
        return 'one of ' + ', '.join(str(o[1] if isinstance(o, (list, tuple)) else o) for o in f['opts']) + ' (often just the first letter, or the number)'
    return {'time': 'a 24-hour clock time such as 07:05', 'num': 'a decimal number', 'int': 'a whole number',
            'code': 'a number'}.get(f['type'], 'text')


class AnthropicReader:
    """Claude vision. Needs `pip install anthropic` and ANTHROPIC_API_KEY in the environment. Only crops of de-identified
    cells (numbers, times) are ever sent: never IDs, dates, names or free text."""
    def __init__(self, model=None):
        import anthropic
        # Sonnet by default (cheaper); SCAN_MODEL=claude-opus-5-5 for the hardest pages
        self.client, self.model = anthropic.Anthropic(), model or os.environ.get('SCAN_MODEL', 'claude-sonnet-5-5')

    def read(self, png, f, variant):
        unit = f' ({f["unit"]})' if f.get('unit') else ''
        prompt = (PROMPT_A if variant == 0 else PROMPT_B).format(label=f['label'], unit=unit, expect=_expect(f))
        msg = self.client.messages.create(model=self.model, max_tokens=100, messages=[{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(png).decode()}},
            {'type': 'text', 'text': prompt}]}])
        raw = ''.join(b.text for b in msg.content if b.type == 'text')
        m = re.search(r'\{.*\}', raw, re.S)
        try:
            j = json.loads(m.group(0))
            return {'text': str(j.get('text', '')), 'legible': bool(j.get('legible', False))}
        except Exception:
            return {'text': '', 'legible': False}


class StubReader:
    """For tests: answers from a known truth, optionally wrong now and then, so the checks can be exercised."""
    def __init__(self, truth, wrong=None):
        self.truth, self.wrong = truth, wrong or {}

    def read(self, png, f, variant):
        t = self.wrong.get((f['id'], variant), self.truth.get(f['id'], ''))
        return {'text': t, 'legible': True}


class FileReader:
    """No API: readings someone else made from the exported crops (--export-crops), as {field id: text}. One read stands
    in for both, so there is no second opinion; the review screen is the only check."""
    def __init__(self, path):
        self.readings = json.load(open(path, encoding='utf-8'))

    def read(self, png, f, variant):
        r = self.readings.get(f['id'])
        if isinstance(r, dict):           # {"text": "34.0", "legible": false}: say so when a cell is hard to read
            return {'text': str(r.get('text', '')), 'legible': bool(r.get('legible', True))}
        return {'text': '' if r is None else str(r), 'legible': r is not None}


class CropExporter:
    """Writes each handwritten crop to a folder with a manifest, reads nothing (for a person or another session to read)."""
    def __init__(self, folder):
        self.folder, self.manifest = folder, {}
        os.makedirs(folder, exist_ok=True)

    def read(self, png, f, variant):
        if variant == 0:
            open(os.path.join(self.folder, f['id'] + '.png'), 'wb').write(png)
            self.manifest[f['id']] = dict(label=f['label'], type=f['type'], unit=f.get('unit'))
            json.dump(self.manifest, open(os.path.join(self.folder, 'manifest.json'), 'w', encoding='utf-8'), indent=1)
        return {'text': '', 'legible': False}
