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

declare let localforage: any;
declare let textMetrics: any;
declare let YALAP: any;

(async function() {
    const gebi = document.getElementById.bind(document);
    const dce = document.createElement.bind(document);
    const lf = localforage.createInstance({
        name: "contraptcha"
    });

    const imageCt = 4;
    const wordCt = 6;
    const videoModels = {"wan-2.2": 1};

    // Get all our references
    const mainBox = gebi("main");
    const panelGuard = gebi("panelguard");
    const panelBox1 = gebi("panelbox1");
    const panelBox3 = gebi("panelbox3");
    const imgBoxes: HTMLElement[] = [];
    for (let i = 0; i < imageCt; i++)
        imgBoxes.push(gebi(`img${i+1}`));
    const wgBoxes: HTMLElement[] = [];
    for (let i = 0; i < wordCt; i++)
        wgBoxes.push(gebi(`wg${i+1}`));
    const winp: HTMLInputElement = gebi("wordinput");
    const scoreDisp = gebi("scoredisplay");

    const loadingPanel = gebi("loadingpanel");
    const introPanel = gebi("intropanel");
    const helpPanel = gebi("helppanel");
    const creditsPanel = gebi("creditspanel");
    const creditsMsg = gebi("creditsbox");
    const communityPanel = gebi("communitypanel");
    const menuPanel = gebi("menupanel");
    const dailyPanel = gebi("dailypanel");
    const dailyPanelInp = gebi("dailyinp");
    const msgPanel = gebi("messagepanel");
    const msgPanelMsg = gebi("messagepanelmessage");
    const statsPanel = gebi("statspanel");
    const statsPanelInner = gebi("statspanelinner");
    let imgPanelSrc = "";
    const imgPanel = gebi("imgpanel");
    const imgPanelImg = gebi("imgpanelimg");

    let adTargets: string[] | null = null;

    let mainPromise: Promise<unknown> = Promise.all([]);

    // Create an image for each imgBox
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < imageCt; i++) {
        const img = imgs[i] = dce("img");
        imgBoxes[i].appendChild(img);
    }
    const popOut: (()=>unknown)[] = [];
    while (popOut.length < imageCt)
        popOut.push(()=>{});

    // Create five rows for each wordguess box
    const wgRows: HTMLElement[][] = [];
    for (let i = 0; i < wordCt; i++) {
        const wgCol: HTMLElement[] = [];
        wgRows.push(wgCol);
        for (let j = 0; j < 5; j++) {
            const row = dce("div");
            row.classList.add("wordguessel");
            row.innerHTML = "&nbsp;";
            wgCol.push(row);
            wgBoxes[i].appendChild(row);
        }
    }

    // Game state
    let state: {
        guessed: boolean[],
        guessOrder: number[],
        guessVals: [string, number][][],
        guessWords: Record<string, boolean>[],
        score: number,
        retried: boolean,
        gaveUp: boolean,

        guessesPerWord: number[],
        hintsPerWord: number[];
        retries: number,
        gaveUpGuessed: boolean[] | null
    } | null = null;

    const hidden: boolean[] = [];
    while (hidden.length < wordCt)
        hidden.push(false);
    const forceShow: boolean[] = [];
    while (forceShow.length < wordCt)
        forceShow.push(false);

    let lastGuess: [number, [string, number]] | null = null;

    let seed = 0;
    let words: string[] = [];
    let similarity: Record<string, Record<string, number[]>> =
        Object.create(null);
    let hintFiles: Record<number, [string, number]> = {};
    let credits: any = null;
    let beatEveryPuzzle = false;

    let currentPanel: HTMLElement | null = null;
    let modalPanel = false;

    /**
     * Load this file as JSON, showing a loading screen if needed.
     */
    async function loadJSON(url: string, opts: {
        xz?: boolean
    } = {}) {
        let endPromise: Promise<unknown> | null = null;
        let timeout = <number | null> <any> setTimeout(() => {
            timeout = null;
            panel(loadingPanel, true);

            /* It's annoying for the loading screen to flash quickly, so make
             * sure it stays up for at least one second. */
            endPromise = new Promise(res => setTimeout(res, 1000));
        }, 1000);

        try {
            const f = await fetch(url);
            let ret: any;
            if (opts.xz) {
                // unxz it then parse
                const y = await YALAP.YALAPR(f.body, {formats: ["raw"]});
                const xz = await y.nextFile();
                const rdr = xz.stream.getReader();
                const parts: Uint8Array[] = [];
                while (true) {
                    const part = await rdr.read();
                    if (part.done)
                        break;
                    parts.push(part.value);
                }
                await y.free();
                const blob = new Blob(parts);
                const txt = (new TextDecoder()).decode(await blob.arrayBuffer());
                ret = JSON.parse(txt);

            } else {
                ret = await f.json();

            }

            return ret;
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            } else {
                await endPromise;
                panel(null);
            }
        }
    }

    /**
     * Load the state for the current game. If the player hasn't played this
     * game, load a blank state.
     */
    async function loadState() {
        state = await lf.getItem(`game-${seed}`);
        if (!state) {
            state = {
                guessed: [],
                guessOrder: [],
                guessVals: [],
                guessWords: [],
                score: 100,
                retried: false,
                gaveUp: false,
                guessesPerWord: [],
                hintsPerWord: [],
                retries: 0,
                gaveUpGuessed: null
            };
        }

        // Update old versions
        if (!("score" in <any> state)) {
            state.score = 100;
            state.retried = false;
        }
        if (!("guessesPerWord" in <any> state)) {
            state.guessesPerWord = [];
            state.hintsPerWord = [];
            state.retries = 0;
            state.gaveUpGuessed = null;
        }

        while (state.guessed.length < wordCt)
            state.guessed.push(false);
        while (state.guessVals.length < wordCt)
            state.guessVals.push([]);
        while (state.guessWords.length < wordCt)
            state.guessWords.push(Object.create(null));
        while (state.guessesPerWord.length < wordCt)
            state.guessesPerWord.push(0);
        while (state.hintsPerWord.length < wordCt)
            state.hintsPerWord.push(0);
    }

    async function getDailySeeds() {
        let dailySeeds: number[];
        try {
            dailySeeds = await loadJSON(
                "assets/dailies.json?t=" +
                Math.floor(new Date().getTime() / 86400000 /* one day */)
            );
        } catch (ex) {
            dailySeeds = [];
        }
        return dailySeeds;
    }

    interface ChooseSeedOpts {
        ignoreURL?: boolean;
        daily?: boolean;
        setSeed?: number;
    }

    /**
     * Choose a random seed (or the seed given by the URL) and load it.
     * @param ignoreURL  Don't use the seed in the URL.
     */
    async function chooseSeed(opts: ChooseSeedOpts = {}) {
        const url = new URL(document.location.href);
        seed = -1;

        // Load the given seed
        if ("setSeed" in opts) {
            seed = opts.setSeed;
            await loadState();
        }

        // Load the seed from the URL
        if (seed < 0 && !opts.ignoreURL) {
            const paramSeed = url.searchParams.get("s");
            if (paramSeed) {
                seed = +paramSeed;
                await loadState();
            } else if (url.hash.length >= 2) {
                seed = +url.hash.slice(1);
                await loadState();
            }
        }

        // Load the daily seed
        if (seed < 0 && opts.daily) {
            try {
                seed = await loadJSON(
                    "assets/daily.json?t=" +
                    Math.floor(new Date().getTime() / 3600000 /* one hour */)
                );
                await loadState();
            } catch (ex) {
                console.error(ex);
                seed = -1;
            }
        }

        // Or, just choose a random (unbeaten) seed
        if (seed < 0) {
            const dailySeeds = await getDailySeeds();
            const randomSeeds: number[] = await loadJSON("assets/seeds.json?v=2w");
            const seeds = dailySeeds.concat(randomSeeds);
            do {
                if (!seeds.length)
                    break;
                const idx = Math.floor(Math.random() * seeds.length);
                seed = seeds[idx];
                seeds.splice(idx, 1);
                await loadState();
            } while (state.guessed.indexOf(false) < 0);

            if (state.guessed.indexOf(false) < 0)
                beatEveryPuzzle = true;
        }

        if (url.hash || url.search !== `?s=${seed}`) {
            url.hash = "";
            url.search = `?s=${seed}`;
            window.history.pushState({}, `Contraptcha — ${seed}`, url.toString());
        }

        words = await loadJSON(`assets/${seed}/w.json?v=1`);
        similarity = Object.create(null);
        credits = await loadJSON(`assets/${seed}/cr.json`);
        hintFiles = {};
    }

    /**
     * Save the current game state.
     */
    async function saveState() {
        await lf.setItem(`game-${seed}`, state);
    }

    /**
     * Show this panel, or hide the panel.
     * @param to  Panel to show, or null to hide.
     */
    function panel(to: HTMLElement | null, modal = false) {
        panelBox3.innerHTML = "";
        if (to) {
            panelBox3.appendChild(to);
            panelGuard.style.display = "";
            panelBox1.style.display = "";
            imgPanel.style.display = "none";
            setTimeout(() => {
                winp.blur();
                to.focus();
            }, 0);
            currentPanel = to;
            modalPanel = modal;
        } else {
            panelGuard.style.display = "none";
            panelBox1.style.display = "none";
            imgPanel.style.display = "none";
            setTimeout(() => winp.focus(), 0);
            currentPanel = null;
            modalPanel = false;

            // Make sure the URL is correct
            const url = new URL(document.location.href);
            url.hash = "";
            url.search = `?s=${seed}`;
            window.history.replaceState({}, `Contraptcha — ${seed}`, url.toString());
        }
    }

    /**
     * Show this message.
     * @param msg  Message to show (HTML)
     */
    function message(msg: string) {
        msgPanelMsg.innerHTML = msg;
        panel(msgPanel);
    }

    /**
     * Load this image.
     * @param img  Image element to load into
     * @param url  URL to load
     */
    function loadImage(
        img: HTMLImageElement & {ctPromise?: Promise<unknown>}, url: string
    ) {
        if (!img.ctPromise)
            img.ctPromise = Promise.all([]);

        img.ctPromise = img.ctPromise.then(async () => {
            // Load the image
            const loadImg = new Image();
            let loaded = false;
            const loadPromise = new Promise<void>(res => {
                loadImg.onload = () => {
                    loaded = true;
                    res();
                };
            });
            loadImg.src = url;

            // Don't show the spinner if it loads quickly
            await Promise.race([
                loadPromise,
                new Promise(res => setTimeout(res, 500))
            ]);

            if (!loaded) {
                // OK, show the spinner
                img.src = "assets/img/loading-spinner-opaque.webp";
                img.style.objectFit = "none";
                await Promise.race([
                    loadPromise,
                    new Promise(res => setTimeout(res, 2000))
                ]);
            }

            // Then load the real image
            img.src = url;
            img.style.objectFit = "";
        }).catch(console.error);
    }

    /**
     * Get the hex index of the images for our current guess state.
     */
    function guessIndex() {
        const won = state.guessed.indexOf(false) < 0;
        let gidx = 0;
        for (let i = 0; i < wordCt; i++) {
            if ((won || !state.guessed[i] || forceShow[i]) && !hidden[i])
                gidx |= 1 << i;
        }
        if (gidx === 0)
            gidx = (1<<wordCt) - 1;
        let gs = gidx.toString(16);
        if (gs.length < 2)
            gs = `0${gs}`;
        return gs;
    }

    /**
     * Draw the images described by the current state.
     */
    function drawImages() {
        const gidx = guessIndex();
        for (let i = 0; i < 4; i++) {
            imgBoxes[i].innerHTML = "";
            if (credits && videoModels[credits[i]]) {
                const vid = document.createElement("video");
                vid.controls = false;
                vid.muted = vid.defaultMuted = true;
                vid.autoplay = true;
                vid.loop = true;
                vid.src = `assets/${seed}/${i}_${gidx}.webm`;
                imgBoxes[i].appendChild(vid);
                vid.onclick = popOut[i] = () => popOutVideo(vid, i);

            } else {
                imgBoxes[i].appendChild(imgs[i]);
                const src = `assets/${seed}/${i}_${gidx}.webp`;
                loadImage(imgs[i], src);
                imgs[i].onclick = popOut[i] = () => popOutImage(i);

            }
        }
    }

    /**
     * Pop out (highlight) a particular image.
     */
    function popOutImage(idx: number) {
        const gidx = guessIndex();
        const src = `assets/${seed}/${idx}_${gidx}.webp`;

        if (imgPanelSrc === src && imgPanel.style.display === "") {
            // Toggle it
            panel(null);
            return;
        }

        imgPanel.innerHTML = "";
        imgPanel.appendChild(imgPanelImg);
        imgPanelImg.src = imgPanelSrc = src;
        panelGuard.style.display = "";
        imgPanel.style.display = "";
        imgPanel.onclick = imgPanelImg.onclick = () => {
            panel(null);
        };

        const url = new URL(document.location.href);
        url.hash = "";
        url.search = `?s=${seed}&i=${idx}_${gidx}`;
        window.history.replaceState({}, `Contraptcha — ${seed}`, url.toString());
    }

    /**
     * Pop out (highlight) a particular video.
     */
    function popOutVideo(vid: HTMLVideoElement, idx: number) {
        const gidx = guessIndex();

        if (imgPanelSrc === vid.src && imgPanel.style.display === "") {
            // Toggle it
            panel(null);
            imgBoxes[idx].innerHTML = "";
            imgBoxes[idx].appendChild(vid);
            return;
        }

        imgPanel.innerHTML = "";
        imgPanel.appendChild(vid);
        imgPanelSrc = vid.src;
        panelGuard.style.display = "";
        imgPanel.style.display = "";
        imgPanel.onclick = () => {
            panel(null);
        };

        const url = new URL(document.location.href);
        url.hash = "";
        url.search = `?s=${seed}&i=${idx}_${gidx}`;
        window.history.replaceState({}, `Contraptcha — ${seed}`, url.toString());
    }

    /**
     * Convert a value to a red-green color.
     */
    function toRGB(val: number) {
        val = Math.max(Math.min(val, 1), 0);
        /* NOTE: This is mathematically wrong, but looks better than the
         * mathematically correct option, since the in-between colors this dark
         * just look gross. */
        if (val > 0.5)
            return `rgb(${(1 - val) * 50}% 33% 0%)`;
        else
            return `rgb(33% ${val * 50}% 0%)`;
    }

    /**
     * Draw a single word guess element.
     */
    function drawWordGuess(
        el: HTMLElement & {cpTextMetrics?: any}, text: string, bgColor: string,
        fgColor = ""
    ) {
        el.innerText = text;
        el.style.fontSize = "";
        el.style.backgroundColor = bgColor;
        el.style.color = fgColor;
        el.style.animation = "";

        if (!text)
            return;

        (async function() {
            if (el.clientWidth <= 0)
                await new Promise(res => setTimeout(res, 0));
            if (el.clientWidth <= 0)
                return;
            if (!el.cpTextMetrics)
                el.cpTextMetrics = textMetrics.init(el);
            const tm = el.cpTextMetrics;
            if (el.cpTextMetrics.width(text) > el.clientWidth - 8)
                el.style.fontSize = el.cpTextMetrics.maxFontSize(text);
        })();
    }

    /**
     * Draw the word guesses described by the current state.
     */
    function drawWordGuesses(onlyWords?: boolean) {
        const won = state.guessed.indexOf(false) < 0;
        for (let wi = 0; wi < wordCt; wi++) {
            const wgCol = wgRows[wi];
            if (state.guessed[wi]) {
                drawWordGuess(
                    wgCol[0], words[wi].toUpperCase(),
                    forceShow[wi]
                        ? "#350"
                        : ((won && hidden[wi]) ? "#333" : "#050")
                );
            } else {
                drawWordGuess(
                    wgCol[0], "??????",
                    hidden[wi] ? "#333" : "#500"
                );
            }
            if (onlyWords)
                continue;

            let sawLastGuess = false, repeatLastGuess = false;;
            const wGuesses = state.guessVals[wi];
            for (let ri = 0; ri < 4; ri++) {
                const row = wgCol[ri+1];
                if (ri >= wGuesses.length) {
                    drawWordGuess(row, "", "");
                    continue;
                }

                /* If we're in the last row, we show the most recent guess even
                 * if it's bad */
                let guess = wGuesses[ri];
                if (ri === 3) {
                    if (repeatLastGuess || !lastGuess || lastGuess[0] !== wi) {
                        drawWordGuess(row, "", "");
                        break;
                    }
                    if (!sawLastGuess)
                        guess = lastGuess[1];
                }

                // Was this the most recent guess?
                let wasLastGuess = false;
                if (lastGuess && lastGuess[0] === wi &&
                    lastGuess[1][0] === guess[0]) {
                    wasLastGuess = sawLastGuess = true;
                }

                // Draw this word
                const text =
                    `${guess[0].toUpperCase()}: ${Math.round(guess[1]*100)}`;
                let bgColor: string, fgColor: string = "";
                if (wasLastGuess) {
                    bgColor = "#999";
                    fgColor = "#000";
                    if (row.innerText === text) {
                        /* Bit of a cheat: if they're guessing a word they
                         * already saw, we set repeatLastGuess to prevent it
                         * from showing #4 */
                        repeatLastGuess = true;
                    }
                } else {
                    bgColor = toRGB(guess[1] / 0.8);
                }
                drawWordGuess(row, text, bgColor, fgColor);

                /* If we're in the last row and this wasn't the last guess, fade
                 * it out */
                if (ri === 3 && !wasLastGuess)
                    row.style.animationName = "fadeOut";
            }
        }

        // Also draw the score while we're here
        drawWordGuess(
            scoreDisp,
            "" + state.score +
                ((state.retried || state.gaveUp) ? "*" : ""),
            toRGB(state.score / 100)
        );
    }

    /**
     * Hide (block, censor) this word.
     * @param toHide  Word to hide (offset)
     */
    function hideWord(toHide: number) {
        if (state.guessed.indexOf(false) < 0) {
            /* When you've beaten the game, you can hide anything (see all
             * images) */
            hidden[toHide] = !hidden[toHide];

        } else if (state.guessed.filter(x => !x).length === 1) {
            /* When you have only one word left, you can forcibly show any *one*
             * other word. */
            if (forceShow[toHide]) {
                forceShow[toHide] = false;
            } else if (hidden[toHide]) {
                hidden[toHide] = false;
            } else {
                forceShow.fill(false);
                hidden.fill(false);
                if (state.guessed[toHide])
                    forceShow[toHide] = true;
                else
                    hidden[toHide] = true;
            }

        } else {
            if (state.guessed[toHide])
                return;
            for (let wi = 0; wi < wordCt; wi++) {
                const wb = wgRows[wi][0];
                if (wi === toHide)
                    hidden[wi] = !hidden[wi];
                else
                    hidden[wi] = false;
            }
        }
        drawImages();
        drawWordGuesses(true);
    }

    /**
     * Make a guess.
     * @param word  Word to guess.
     */
    async function guess(word: string, scoreChange?: number) {
        // First check if they just got it
        let gotIt = words.indexOf(word);
        if (gotIt >= 0 && !state.guessed[gotIt]) {
            state.guessed[gotIt] = true;
            state.guessOrder = state.guessOrder || [];
            state.guessOrder.push(gotIt);
            state.guessVals[gotIt] = [];
            state.guessesPerWord[gotIt]++;
            lastGuess = null;
            hidden.fill(false);
            forceShow.fill(false);
            drawImages();
            drawWordGuesses();
            await saveState();
            return;
        }

        // Check if it's a valid word at all
        if (/[^a-z]/.test(word)) {
            message("Invalid word! Hyphens, apostrophes, and other symbols are not allowed.");
            return;
        }
        const first = word[0];

        // Make sure we have this similarity file
        if (!similarity[first]) {
            similarity[first] =
                await loadJSON(`assets/${seed}/w-${first}.json.xz`, {xz: true});
        }

        // Check which is most similar
        const sword = similarity[first][word];
        if (!sword) {
            // No similarity, invalid word!
            message("Unrecognized word!");
            return;
        }
        let mostVal = -1;
        let mostIdx = -1;
        for (let wi = 0; wi < wordCt; wi++) {
            if (state.guessed[wi])
                continue;
            if (sword[wi] > mostVal) {
                mostVal = sword[wi];
                mostIdx = wi;
            }
        }
        mostVal = Math.max(mostVal, 0);
        if (mostIdx < 0)
            return;

        // Put it in place
        lastGuess = [mostIdx, [word, mostVal]];

        // Don't repeatedly add guesses to the list
        if (!state.guessWords[mostIdx][word]) {
            // Add it to the guess-o-dex
            state.guessVals[mostIdx].push(lastGuess[1]);
            state.guessVals[mostIdx].sort((x, y) => y[1] - x[1]);
            state.guessWords[mostIdx][word] = true;
            state.guessesPerWord[mostIdx]++;

            // And affect the score
            if (typeof scoreChange !== "number")
                scoreChange = Math.ceil((60 - Math.round(mostVal * 100)) / 10);
            if (scoreChange > 0)
                state.score -= scoreChange;
        }
        drawWordGuesses();
        await saveState();
    }

    /**
     * Give a hint.
     */
    async function hint() {
        // Choose the word to hint in
        let wi: number;
        if (lastGuess) {
            // Simple: most recent word
            wi = lastGuess[0];

        } else {
            // An unguessed word
            const unguessed = [];
            for (let ui = 0; ui < wordCt; ui++) {
                if (!state.guessed[ui])
                    unguessed.push(ui);
            }
            if (!unguessed.length)
                return;
            wi = unguessed[Math.floor(Math.random() * unguessed.length)];
        }

        // Get the hint file
        if (!hintFiles[wi])
            hintFiles[wi] = await loadJSON(`assets/${seed}/w${wi}-top.json.xz`, {xz: true});

        // Choose a random word to use as hint
        let hintWords = Object.keys(hintFiles[wi]);
        let hintWord = "";
        let hintValue: number;
        while (true) {
            if (!hintWords.length)
                break;
            const idx = Math.floor(Math.random() * hintWords.length);
            hintWord = hintWords[idx];
            hintValue = hintFiles[wi][hintWord];
            if (state.guessWords[hintWord]) {
                hintWords.splice(idx, 1);
                delete hintFiles[wi][hintWord];
            } else break;
        }
        if (!hintWord) {
            message("I've run out of hint words :(");
            return;
        }

        // Affect the score
        hintValue = Math.round(hintValue * 100);
        const scoreChange = Math.floor(hintValue / 10) * 3;
        state.hintsPerWord[wi]++;

        guess(hintWord, scoreChange);
    }

    /**
     * Restart the game.
     */
    async function restart() {
        state.guessed.fill(false);
        hidden.fill(false);
        forceShow.fill(false);
        for (let wi = 0; wi < wordCt; wi++) {
            state.guessVals[wi] = [];
            state.guessWords[wi] = Object.create(null);
        }
        state.score = 100;
        state.retried = true;
        state.retries++;
        lastGuess = null;
        await saveState();
        drawImages();
        drawWordGuesses();
        setTimeout(() => winp.focus(), 0);
    }

    /**
     * Start a new game with the given options.
     */
    async function newGame(opts: ChooseSeedOpts = {}) {
        hidden.fill(false);
        forceShow.fill(false);
        lastGuess = null;
        await chooseSeed(opts);
        await drawImages();
        await drawWordGuesses();
        if (
            !("setSeed" in opts) && !opts.daily && opts.ignoreURL &&
            beatEveryPuzzle
        ) {
            message("Congratulations! You've beaten every puzzle currently in the game!");
        }
    }

    /**
     * Give up on this game.
     */
    async function giveUp() {
        if (state.score > 0) {
            message("You can only give up once you've reached 0 score. Come on, give it a few more tries!");
            return;
        }

        if (state.guessed.indexOf(false) < 0) {
            // Giving up a game you've won?
            return;
        }

        state.gaveUp = true;
        state.gaveUpGuessed = state.guessed.slice(0);
        for (let wi = 0; wi < words.length; wi++) {
            if (!state.guessed[wi])
                await guess(words[wi]);
        }
    }

    /**
     * Show the selector for all daily puzzles.
     */
    async function dailiesPanel() {
        const dailySeeds = await getDailySeeds();
        const earliest = new Date("2024-01-24");
        const latest = new Date(
            earliest.getTime() +
            (dailySeeds.length-1) * 86400000
        );
        dailyPanelInp.min = earliest.toISOString().slice(0, 10);
        dailyPanelInp.max = latest.toISOString().slice(0, 10);

        // Set it for the current seed
        {
            const currentIdx = dailySeeds.indexOf(seed);
            if (currentIdx >= 0) {
                const current = new Date(
                    earliest.getTime() +
                    currentIdx * 86400000
                );
                dailyPanelInp.value = current.toISOString().slice(0, 10);
            } else {
                dailyPanelInp.value = dailyPanelInp.max;
            }
        }

        dailyPanelInp.onchange = () => {
            const chosenDate = new Date(dailyPanelInp.value);
            const chosen = Math.round(
                (chosenDate.getTime() - earliest.getTime()) / 86400000
            );
            panel(null);
            if (chosen >= 0 && chosen < dailySeeds.length)
                newGame({ignoreURL: true, setSeed: dailySeeds[chosen]});
        };

        panel(dailyPanel);
        dailyPanelInp.focus();
    }

    /**
     * Show game stats (NOTE: this is the stats for *all* games).
     */
    async function stats() {
        panel(loadingPanel, true);
        statsPanelInner.innerHTML = "";

        let inProgress: HTMLElement[] = [];
        let completed: HTMLElement[] = [];

        for (const key of await lf.keys()) {
            if (!/^game-/.test(key))
                continue;

            try {
                const gSeed = +key.slice(5);
                const gState = await lf.getItem(key);
                const btn = dce("button");
                btn.classList.add("statsbtn");
                const img = dce("img");
                img.src = `assets/${gSeed}/thumb.webp`;
                img.classList.add("statsimg");
                btn.appendChild(img);
                const score = dce("div");
                score.innerText =
                    gState.score +
                    ((gState.retried || gState.gaveUp) ? "*" : "");
                score.style.backgroundColor = toRGB(gState.score / 100);
                btn.appendChild(score);
                btn.onclick = async () => {
                    panel(null);
                    await newGame({setSeed: gSeed});
                };
                if (gState.guessed.indexOf(false) < 0)
                    completed.push(btn);
                else
                    inProgress.push(btn);
            } catch (ex) {}

            await new Promise(res => setTimeout(res, 0));
        }

        if (inProgress.length) {
            const h2 = dce("h2");
            h2.innerText = "Puzzles in progress";
            statsPanelInner.appendChild(h2);
            for (const img of inProgress)
                statsPanelInner.appendChild(img);
        }

        if (completed.length) {
            const h2 = dce("h2");
            h2.innerText = "Completed puzzles";
            statsPanelInner.appendChild(h2);
            for (const img of completed)
                statsPanelInner.appendChild(img);
        }

        if (!inProgress.length && !completed.length) {
            const h2 = dce("h2");
            h2.innerText = "You haven't started any puzzles yet!";
            statsPanelInner.appendChild(h2);
        }

        panel(statsPanel);
    }

    /**
     * Copy the stats for this game.
     */
    async function copyStats() {
        // Generate our stats code
        let stats =
            `Contraptcha seed #${seed}\n` +
            `https://contraptcha.com/?s=${seed}\n\n` +
            `Score: ${state.score}${(state.retried || state.gaveUp) ? "*" : ""}\n\n`;

        let guessed = state.gaveUpGuessed || state.guessed;
        const guessOrder = state.guessOrder || [];
        for (let wi = 0; wi < wordCt; wi++) {
            const gct = state.guessesPerWord[wi];
            const hct = state.hintsPerWord[wi];
            let icon = "🟥";
            if (guessed[wi]) {
                const guessO = guessOrder.indexOf(wi);
                if (guessO >= 0)
                    icon = String.fromCharCode(0x31 + guessO) + "\u20e3";
                else
                    icon = "🟩";
            }
            stats +=
                icon +
                ` (${gct} guess${(gct === 1) ? "" : "es"}`;
            if (hct)
                stats += `, ${hct} hint${(hct === 1) ? "" : "s"}`;
            stats += `)\n`;
        }

        if (state.retries || state.gaveUpGuessed)
            stats += "\n";

        if (state.retries)
            stats += `Retried ${state.retries} times\n`;

        if (state.gaveUpGuessed) {
            const left = state.gaveUpGuessed.filter(x => !x).length;
            stats += `Gave up with ${left} word${(left === 1) ? "" : "s"} left\n`;
        }

        // Copy it via a textarea
        const statsTE: HTMLTextAreaElement = dce("textarea");
        Object.assign(statsTE.style, {
            position: "fixed",
            left: "101vw",
            top: "101vh"
        });
        document.body.appendChild(statsTE);
        statsTE.innerHTML = stats;
        statsTE.select();
        document.execCommand("copy");
        document.body.removeChild(statsTE);

        message("Puzzle stats copied to clipboard.");
    }

    /**
     * Configure the "ads" (the ads are just AI-generated nonsense).
     */
    async function configAds() {
        const time = new Date().getTime();

        if (!adTargets) {
            try {
                adTargets = await loadJSON("/assets/ad-targets.json?v=1");
            } catch (ex) {
                adTargets = [];
            }
        }
        if (!adTargets.length)
            return;

        for (const ad of [
            ["ad1", "s"], ["ad2", "s"], ["ad3", "b"]
        ]) {
            const a = gebi(`${ad[0]}a`);
            const img = gebi(ad[0]);
            a.href = adTargets[Math.floor(Math.random() * adTargets.length)];
            img.src = `/scripts/ad.jss?i=${ad[0]}&t=${ad[1]}&r=${time}`;
            img.style.display = "block";
        }
    }

    /**
     * Show the credits panel, complete with credits.
     */
    async function showCredits() {
        // Turn it into links
        let html = "";
        for (let i = 0; i < credits.length; i++) {
            const cr = credits[i];
            if (i !== 0)
                html += ", ";
            if (i === credits.length - 1)
                html += "and ";
            switch (cr) {
                case "hunyuan-image-2.1":
                    html += '<a href="https://huggingface.co/tencent/HunyuanImage-2.1">HunyuanImage 2.1</a>';
                    break;

                case "qwen-image":
                    html += '<a href="https://huggingface.co/Qwen/Qwen-Image">Qwen-Image</a> with <a href="https://huggingface.co/lightx2v/Qwen-Image-Lightning">Qwen-Image-Lightning</a>';
                    break;

                case "wan-2.2":
                    html += '<a href="https://huggingface.co/Wan-AI/Wan2.2-T2V-A14B">Wan2.2</a> with <a href="https://huggingface.co/lightx2v/Wan2.2-Lightning">Wan2.2-Lightning</a>';
                    break;

                case "infinity-8b":
                    html += '<a href="https://huggingface.co/FoundationVision/Infinity">Infinity 8B-512x512</a>';
                    break;

                case "hidream-i1-fast":
                    html += '<a href="https://huggingface.co/HiDream-ai/HiDream-I1-Fast">HiDream-I1 Fast</a>';
                    break;
                case "lumina-2":
                    html += '<a href="https://huggingface.co/Alpha-VLLM/Lumina-Image-2.0">Lumina-Image-2.0</a>';
                    break;
                case "shuttle-jaguar":
                    html += '<a href="https://civitai.com/models/1167909/shuttle-jaguar">Shuttle Jaguar</a>';
                    break;
                case "auraflow-0.3":
                    html += '<a href="https://huggingface.co/fal/AuraFlow-v0.3">AuraFlow v0.3</a>';
                    break;
                case "shuttle3":
                    html += '<a href="https://civitai.com/models/943001?modelVersionId=1055701">Shuttle 3 Diffusion</a>';
                    break;
                case "pixelwave3schnell":
                    html += '<a href="https://civitai.com/models/141592?modelVersionId=1002647">PixelWave</a>';
                    break;
                case "juggernautxl11":
                    html += '<a href="https://civitai.com/models/133005?modelVersionId=782002">Juggernaut XL</a>';
                    break;
                case "juggernautxl8":
                    html += '<a href="https://civitai.com/models/133005?modelVersionId=288982">Juggernaut XL</a>';
                    break;
                case "realvisxl3.0turbo":
                    html += '<a href="https://civitai.com/models/139562?modelVersionId=272378">RealVisXL</a>';
                    break;
                case "dreamshaperxlsfwturbo":
                    html += '<a href="https://civitai.com/models/112902?modelVersionId=302806">DreamShaper XL</a>';
                    break;
                case "flux1schnell":
                    html += '<a href="https://huggingface.co/black-forest-labs/FLUX.1-schnell">FLUX.1 Schnell</a>';
                    break;
                case "sdxl":
                    html += '<a href="https://stability.ai/stable-image">Stable Diffusion XL</a>';
                    break;
                case "pe-bad-medieval-art":
                    html += '<a href="https://stability.ai/stable-image">SDXL</a> with <a href="https://civitai.com/models/129604?modelVersionId=142084">PE Shitty Medieval Paintings</a>';
                    break;
                case "sdxl-mspaint-portrait":
                    html += '<a href="https://stability.ai/stable-image">SDXL</a> with <a href="https://civitai.com/models/183354?modelVersionId=205793">SDXL MS Paint Portraits</a>';
                    break;
                case "nicolai-doodle":
                    html += '<a href="https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5">SD1.5</a> with <a href="https://civitai.com/models/90558/child-type-doodles">child-type doodles</a>';
                    break;
                case "sdxl-loves-trains":
                    html += '<a href="https://stability.ai/stable-image">SDXL</a> with “train” added to every prompt';
                    break;
                default:
                    html += cr;
            }
        }
        creditsMsg.innerHTML = html;
        panel(creditsPanel);
    }

    // Choose the initial seed
    await chooseSeed({daily: true});

    // Set up the ability to hide words
    for (let wi = 0; wi < wordCt; wi++)
        wgRows[wi][0].onclick = () => hideWord(wi);

    // Draw the initial state of the board
    drawImages();
    drawWordGuesses();
    mainBox.style.display = "";
    panelBox1.onclick = () => !modalPanel && panel(null);
    {
        const btns = document.getElementsByClassName("close");
        for (let i = 0; i < btns.length; i++)
            (<HTMLElement> btns[i]).onclick = () => !modalPanel && panel(null);
    }
    panelBox3.onclick = ev => ev.stopPropagation();

    configAds();
    setInterval(configAds, 5 * 60 * 1000);

    // Handle events
    window.addEventListener("keydown", ev => {
        if (!modalPanel && (ev.key === "Escape" || ev.key === "Enter"))
            panel(null);
    });
    window.addEventListener("resize", () => drawWordGuesses());
    window.addEventListener("popstate", async () => {
        // Check for navigating to a different seed
        let useed = seed;
        const url = new URL(document.location.href);
        const paramSeed = url.searchParams.get("s");
        if (paramSeed)
            useed = +paramSeed;
        else if (url.hash.length > 1)
            useed = +url.hash.slice(1);

        if (useed !== seed)
            await newGame({setSeed: useed});
    });

    // Special circumstances
    if (!(await lf.getItem("seen-intro"))) {
        panel(introPanel);
        await lf.setItem("seen-intro", true);
    } else {
        panel(null);
    }

    // Set up the buttons
    gebi("menubtn").onclick = () => panel(menuPanel);
    gebi("hintbtn").onclick = hint;
    gebi("introbtn").onclick = () => panel(introPanel);
    gebi("helpbtn").onclick = () => panel(helpPanel);
    gebi("creditsbtn").onclick = () => showCredits();
    gebi("communitybtn").onclick = () => panel(communityPanel);
    gebi("restartbtn").onclick = restart;
    gebi("dailybtn").onclick = () => {
        panel(null);
        newGame({ignoreURL: true, daily: true});
    };
    gebi("dailiesbtn").onclick = dailiesPanel;
    gebi("newbtn").onclick = () => {
        panel(null);
        newGame({ignoreURL: true});
    };
    gebi("statsbtn").onclick = stats;
    gebi("giveupbtn").onclick = () => {
        panel(null);
        giveUp();
    };
    scoreDisp.onclick = copyStats;
    gebi("copystatsbtn").onclick = copyStats;

    // And play the game
    winp.onkeydown = ev => {
        if (/^[0-9]/.test(ev.key)) {
            // Change hidden state
            ev.preventDefault();
            hideWord(+ev.key - 1);
            return;
        }
        if (ev.key === "!" || ev.key === "@" || ev.key === "#" || ev.key === "$") {
            // Pop out an image
            let idx = (<Record<string, number>> {
                "!": 0,
                "@": 1,
                "#": 2,
                "$": 3
            })[ev.key] || 0;
            if (!modalPanel)
                popOut[idx]();
            return;
        }
        if (ev.key === "Escape") {
            panel(null);
            return;
        }
        if (ev.key !== "Enter")
            return;
        ev.preventDefault();
        ev.stopPropagation();

        const word = winp.value;
        winp.value = "";
        if (!word.length)
            return;

        mainPromise = mainPromise.then(() => {
            if (word[0] === "/") {
                // Commands
                const cmd = word.slice(1).toLowerCase();
                if (cmd === "restart")
                    return restart();
                else if (cmd === "daily")
                    return newGame({ignoreURL: true, daily: true});
                else if (cmd === "dailies")
                    return dailiesPanel();
                else if (cmd === "newgame" || cmd === "new")
                    return newGame({ignoreURL: true});
                else if (cmd === "stats")
                    return stats();
                else if (cmd === "copy")
                    return copyStats();
                else if (cmd === "giveup")
                    return giveUp();
                else if (cmd === "hint")
                    return hint();
                else if (cmd === "intro")
                    panel(introPanel);
                else if (cmd === "help")
                    panel(helpPanel);
                else if (cmd === "credits")
                    panel(creditsPanel);
                return;
            }

            return guess(word);
        });
    };

    winp.onkeyup = ev => {
        winp.value = winp.value.replace(/[^A-Za-z\/]/g, "").toLowerCase();
    };
})();
