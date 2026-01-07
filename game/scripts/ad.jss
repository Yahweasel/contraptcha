<?JS
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
let type = "b";
if (request.query && request.query.t && request.query.t === "s")
    type = "s";
let files = null;
let filesCached = false;
try {
    files = JSON.parse(await fs.readFile(`${__dirname}/../assets/ads.json`));
    filesCached = true;
} catch (ex) {
    files = await fs.readdir(`${__dirname}/../assets/ads`);
}

if (!filesCached)
    await fs.writeFile(`${__dirname}/../assets/ads.json`, JSON.stringify(files));

while (files.length) {
    const idx = Math.floor(Math.random() * files.length);
    const file = files[idx];
    if (type === "s") {
        if (!/_sad\.webp$/.test(file)) {
            files.splice(idx, 1);
            continue;
        }
    } else { // banner
        if (!/_bad\.webp$/.test(file)) {
            files.splice(idx, 1);
            continue;
        }
    }
    return writeHead(302, {location: `/assets/ads/${file}`});
}
?>
