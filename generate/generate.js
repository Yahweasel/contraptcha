#!/usr/bin/env node
/*
 * Copyright (c) 2024-2026 Yahweasel
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

let models = require("./models.json");
const numWords = 6;
const numModels = 4;

async function main(args) {
    // Choose some models
    models = models.filter(x => !x.startsWith("//"));
    while (models.length > numModels)
        models.splice(~~(Math.random() * models.length), 1);

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
        prompt.model = model;
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
    let backendsStr = await fs.readFile("backends.json", "utf8");
    let backends = JSON.parse(backendsStr);
    let queues;
    function mkQueues() {
        queues = Object.create(null);
        for (const backend of backends) {
            queues[backend] = {
                promises: Array(2).fill(Promise.all([]))
            };
        }
    }
    mkQueues();
    let lastTask = {};

    async function allQueues() {
        for (const key in queues) {
            const queue = queues[key];
            await Promise.all(queue.promises);
        }
    }

    function nextQueue() {
        let ret = [];
        for (const key in queues) {
            const queue = queues[key];
            ret = ret.concat(queue.promises.map((x, idx) => x.then(() => [key, idx])));
        }
        return Promise.race(ret);
    }

    // Run the tasks
    while (true) {
        // Make sure there are tasks
        if (!tasks.length)
            await allQueues();
        if (!tasks.length)
            break;

        // Check the backends
        try {
            const newBackendsStr = await fs.readFile("backends.json", "utf8");
            if (newBackendsStr !== backendsStr) {
                const newBackends = JSON.parse(newBackendsStr);
                await allQueues();
                backendsStr = newBackendsStr;
                backends = newBackends;
                mkQueues();
            }
        } catch (ex) {
            console.error(ex);
        }

        // Choose a task
        const task = tasks.shift();
        if (task.model !== lastTask.model || task.step !== lastTask.step) {
            // Finish the last step
            await allQueues();
            let clearCache = genImg.clearCache;
            if (task.generator.clearCache)
                clearCache = task.generator.clearCache;
            await Promise.all(backends.map(backend => {
                return clearCache(backend, task.step);
            }));
        }
        lastTask = task;

        // Choose a queue
        let [backend, qIdx] = await nextQueue();
        while (qIdx >= queues[backend].promises.length)
            [backend, qIdx] = await nextQueue();

        // And add it to the queue
        const p = (async () => {
            console.log(
                `Generating ${task.oname} (${task.model}, ` +
                `step ${task.step+1}/${task.generator.steps}, ` +
                `queue ${backend}:${qIdx+1})`
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
                const qIdx = queues[backend].promises.indexOf(p);
                if (qIdx >= 0)
                    queues[backend].promises.splice(qIdx, 1);

                // And requeue this task
                tasks.unshift(task);
            }

            return result;
        })();
        queues[backend].promises[qIdx] = p;
    }
}
main(process.argv.slice(2));
