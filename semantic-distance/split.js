#!/usr/bin/env node
/*
 * Copyright (c) 2024 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
 * CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const fs = require("fs/promises");

async function main(args) {
    for (const arg of args) {
        const dist = JSON.parse(await fs.readFile(`${arg}.json`, "utf8"));
        const outp = {};
        for (let cc = "a".charCodeAt(0); cc <= "z".charCodeAt(0); cc++) {
            const c = String.fromCharCode(cc);
            const h = await fs.open(`${arg}-${c}.json`, "w");
            outp[c] = h.createWriteStream();
            outp[c].write("{\n");
        }
        for (const word in dist) {
            const c = word[0];
            if (outp[c])
                outp[c].write(`"${word}": ${dist[word]},\n`);
        }
        for (const key in outp) {
            outp[key].write('"-": 0\n}\n');
            outp[key].end();
        }
    }
}
main(process.argv.slice(2));
