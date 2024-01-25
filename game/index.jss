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
let seed = -1, img = null;
if (request.query && request.query.s)
    seed = +request.query.s;
if (seed >= 0) {
    try {
        img = `/assets/${seed}/0_3f.webp`;
        await fs.access(`${__dirname}${img}`, fs.constants.R_OK);
    } catch (ex) {
        seed = -1;
        img = null;
    }
}

const og = `
        <meta property="og:title" content="Contraptcha" />
        <meta property="og:type" content="website" />
        <meta property="og:description" content="A word puzzle game inspired by AI-generated art and CAPTCHAs." />
        <meta property="og:url" content="https://contraptcha.com/${(seed >= 0) ? ("?s=" + seed) : ""}" />
        <meta property="og:image" content="https://contraptcha.com${img || "/assets/img/limeduck-bg.webp"}" />
        <meta property="og:image:type" content="image/webp" />
        <meta property="og:image:alt" content="An AI-generated puzzle image" />
`;

const index = await fs.readFile(`${__dirname}/index.html`, "utf8");
write(index.replace("<!--OG-->", og));
?>
