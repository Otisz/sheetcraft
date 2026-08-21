# Attribution

The JSON files in this directory are vendored verbatim from
[5e-bits/5e-database](https://github.com/5e-bits/5e-database) at commit
`bfd3db4bcc31699cce703b46feb9af3f0ff08999`, from the `src/2014/en/` path.

Two licences apply, to two different things.

## The code — MIT

The upstream project's code, including the zod schemas vendored under
`src/features/dnd/catalog/schemas/`, is licensed MIT:

```
MIT License

Copyright (c) [2018-2020] [Adrian Padua, Christopher Ward]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## The content — Open Gaming License 1.0a

The underlying game material — the SRD content inside the JSON files — is
released under the
[Open Gaming License Version 1.0a](https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f).

This product uses content from the System Reference Document 5.1, distributed
by Wizards of the Coast, LLC under the OGL 1.0a. It is not affiliated with,
endorsed by, or sponsored by Wizards of the Coast.

The `license` block in `manifest.json` records both: `{ "code": "MIT",
"content": "OGL-1.0a" }`.
