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

const cproc = require("child_process");
const fs = require("fs/promises");

/**
 * Run this command.
 */
function run(cmd) {
    return new Promise(res => {
        const p = cproc.spawn(cmd[0], cmd.slice(1), {
            stdio: ["ignore", "inherit", "inherit"]
        });
        p.on("exit", (code, signal) => {
            if (code === null)
                res(-1);
            else
                res(code);
        });
    });
}

class Backend {
    constructor(cmd, model) {
        this.cmd = cmd.concat(model);
        this.args = [];
        this.imgs = 0;
        this.serPromise = Promise.all([]);
        this.nextPromise = new Promise((res, rej) => {
            this.nextPromiseRes = res;
            this.nextPromiseRej = rej;
        });
    }

    push(args) {
        this.args = this.args.concat(args);
        if (++this.imgs >= 21)
            this.flush();
        return this.nextPromise;
    }

    flush() {
        if (!this.imgs)
            return this.serPromise;

        const args = this.args;
        this.args = [];
        this.imgs = 0;

        const promise = this.nextPromise;
        const res = this.nextPromiseRes;
        const rej = this.nextPromiseRej;

        this.nextPromise = new Promise((res, rej) => {
            this.nextPromiseRes = res;
            this.nextPromiseRej = rej;
        });

        return this.serPromise = this.serPromise.catch(console.error).then(async () => {
            const p = run(this.cmd.concat(args));
            p.then(res).catch(rej);
            return p;
        });
    }
}

const backends = Object.create(null);

/**
 * Get a given backend.
 */
function backend(idx, cmd, model) {
    if (!backends[idx])
        backends[idx] = new Backend(cmd, model);
    return backends[idx];
}

/**
 * Generate an image with this prompt.
 * @param oname  Output name prefix.
 * @param backendIdx  Backend index.
 * @param cmd  Command to run the backend.
 * @param prompt  Prompt to use.
 */
async function generateImg(oname, backendIdx, cmd, model, prompt) {
    const be = backend(backendIdx, cmd, model);
    await be.push([
        "-s", prompt.seed,
        "-p", prompt.prompt,
        "-n", prompt.negative,
        "-o", `${oname}_00001_.png`
    ]);

    // Check if it's NSFW
    const nsfw1 = await run([
        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
        `${oname}.png`
    ]);
    if (!nsfw1) return;

    await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_0.png`);

    //console.log(`${oname} nsfw, regenerating...`);

    // OK, try more seeds
    for (let seedAdd = 1000000000; seedAdd < 16000000000; seedAdd += 1000000000) {
        be.push([
            "-s", prompt.seed + seedAdd,
            "-p", prompt.prompt,
            "-n", prompt.negative,
            "-o", `${oname}_00001_.png`
        ]);
        await be.flush();

        // Still NSFW?
        const nsfw2 = await run([
            "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
            `${oname}_00001_.png`
        ]);
        if (!nsfw2) return;

        // Move away this one
        await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_${seedAdd}.png`);
    }

    //console.log(`${oname} still nsfw, censoring...`);

    // OK, give up, just censor-bar it
    await run([
        "../nsfw/venv/bin/python3",
        "../nsfw/nsfw-censor.py",
        `${oname}_nsfw_0.png`, `${oname}_00001_.png`
    ]);
}

/**
 * Flush all outstanding commands.
 */
async function flush() {
    const ps = [];
    for (const idx in backends)
        ps.push(backends[idx].flush());
    return Promise.all(ps);
}

module.exports = {generateImg, flush};
