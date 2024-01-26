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
const inFiles = await fs.readdir(`${__dirname}/../assets/ads`);
const files = [];
while (inFiles.length) {
    const idx = Math.floor(Math.random() * inFiles.length);
    files.push(inFiles[idx]);
    inFiles.splice(idx, 1);
}
for (const file of files) {
    if (type === "s") {
        if (!/_sad\.webp$/.test(file))
            continue;
    } else { // banner
        if (!/_bad\.webp$/.test(file))
            continue;
    }
    return writeHead(302, {location: `/assets/ads/${file}`});
}
?>
