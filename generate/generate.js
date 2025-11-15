#!/usr/bin/env node
/*
 * Copyright (c) 2024, 2025 Yahweasel
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

/*
 * NOTE:
 * These defaults are set up for using ComfyUI from StableSwarmUI. It should be
 * possible, but maybe not straightforward, to adapt it to ComfyUI directly.
 */

const fs = require("fs/promises");

const genImg = require("./generate-img.js");

const backends = require("./backends.json");

const models = require("./models.json");
const numWords = 6;

async function main(args) {
    // Handle arguments
    let meta = null;
    let outFile = null;
    let words = [];
    let seed = -1;

    for (let ai = 0; ai < args.length; ai++) {
        const arg = args[ai];
        if (arg === "-m") {
            const mstr = args[++ai];
            if (mstr)
                meta = JSON.parse(mstr);
        } else if (arg === "-s") {
            seed = +args[++ai];
        } else if (arg === "--json") {
            words = JSON.parse(await fs.readFile(args[++ai], "utf8"));
        } else if (arg === "-o") {
            outFile = args[++ai];
        } else if (arg[0] === "-") {
            process.exit(1);
        } else {
            words.push(arg);
        }
    }

    if (words.length !== numWords) {
        console.error(`Use: ./generate.js [-m metadata] <${numWords} words>`);
        process.exit(1);
        return;
    }

    // Choose an unused seed
    if (seed < 0) {
        do {
            seed = ~~(Math.random() * 2000000000);
            try {
                await fs.access(`out/${seed}/${seed}.json`, fs.constants.F_OK);
            } catch (ex) {
                break;
            }
        } while (true);
    }
    try {
        await fs.mkdir(`out/${seed}`);
    } catch (ex) {}
    await fs.writeFile(`out/${seed}/${seed}.json`, JSON.stringify(words));
    await fs.writeFile(`out/${seed}/cr.json`, JSON.stringify(models));
    if (meta)
        await fs.writeFile(`out/${seed}/meta.json`, JSON.stringify(meta));

    if (outFile)
        await fs.writeFile(outFile, JSON.stringify(seed));

    // Make all the tasks
    const tasks = [];
    for (let si = 0; si < models.length; si++) {
        const model = models[si];
        const prompt = JSON.parse(await fs.readFile(`models/${model}.json`, "utf8"));
        let generator = genImg;
        if (prompt.generator)
            generator = require(`./generators/${prompt.generator}.js`);
        for (let step = 0; step < generator.steps; step++) {
            for (let chidx = 1; chidx < (1<<numWords); chidx++) {
                // Make the name
                const id = `${seed+si}_${chidx.toString(16).padStart(2, "0")}`;
                const oname = `out/${seed}/${id}`;

                // Make the prompt
                const parts = [];
                for (let i = 0; i < numWords; i++) {
                    if (!(chidx & (1<<i))) continue;
                    parts.push(words[i]);
                }

                // Make the task
                tasks.push({
                    oname,
                    seed: seed + si,
                    positive: parts.join(", "),
                    model,
                    generator,
                    step,
                    prompt
                });
            }
        }
    }

    // Make our queues
    const queues = Array(backends.length * 2).fill(Promise.all([]));
    const qBackends = queues.map((_, idx) => backends[idx%backends.length]);
    let lastTask = {};

    // Run the tasks
    while (true) {
        // Make sure there are tasks
        if (!tasks.length)
            await Promise.all(queues);
        if (!tasks.length)
            break;

        // Choose a task
        const task = tasks.shift();
        if (task.model !== lastTask.model || task.step !== lastTask.step) {
            // Finish the last step
            await Promise.all(queues);
            if (task.model !== lastTask.model) {
                // Clear the cache
                await Promise.all(backends.map(async backend => {
                    try {
                        const f = await fetch(`${backend}/free`, {
                            method: "POST",
                            headers: {"content-type": "application/json"},
                            body: JSON.stringify({
                                unload_models: true,
                                free_memory: true
                            })
                        });
                        await f.text();
                    } catch (ex) {}
                }));
            }
        }
        lastTask = task;

        // Choose a queue
        let qIdx = qBackends.length;
        while (qIdx >= qBackends.length)
            qIdx = await Promise.race(queues.map((x, idx) => x.then(() => idx)));
        const backend = qBackends[qIdx];

        // And add it to the queue
        const p = (async () => {
            console.log(
                `Generating ${task.oname} (${task.model}, ` +
                `step ${task.step+1}/${task.generator.steps}, ` +
                `queue ${qIdx+1}/${queues.length})`
            );
            let result = false;
            try {
                result = await task.generator.generate({
                    oname: task.oname,
                    seed: task.seed,
                    positive: task.positive,
                    negative: "text, watermark, nsfw, penis, vagina, breasts, nude, nudity",
                    step: task.step,
                    backend,
                    prompt: task.prompt
                });
            } catch (ex) {
                console.error(ex);
            }

            if (!result) {
                // Kill this queue
                console.error(`Backend ${backend} nonfunctional?`);
                const qIdx = queues.indexOf(p);
                if (qIdx >= 0) {
                    queues.splice(qIdx, 1);
                    qBackends.splice(qIdx, 1);
                }

                // And requeue this task
                tasks.unshift(task);
            }

            return result;
        })();
        queues[qIdx] = p;
    }
}
main(process.argv.slice(2));
