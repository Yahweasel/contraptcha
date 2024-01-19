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

const fs = require("fs");

const googleCommon = fs.readFileSync("google-10000-english-no-swears.txt", "utf8").trim().split("\n");
const mobyCommon = (function() {
    const ret = Object.create(null);
    const list = fs.readFileSync("COMMON.TXT", "utf8").split("\r\n");
    for (const word of list)
        ret[word] = true;
    return ret;
})();
const nounCommon = (function() {
    const ret = Object.create(null);
    const list = fs.readFileSync("nounlist.csv", "utf8").split("\n");
    for (const word of list)
        ret[word] = true;
    return ret;
})();

const common = googleCommon.filter(x => mobyCommon[x] && nounCommon[x]);
for (const word of common)
    process.stdout.write(`${word}\n`);
