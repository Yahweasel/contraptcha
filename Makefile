CC=gcc
CFLAGS=-O3

YALAP_VERSION=1.0.2

all: \
	semantic-distance/distance \
	game/contraptcha.js \
	game/assets/libs/yalap-$(YALAP_VERSION)-unxz.js

semantic-distance/distance: semantic-distance/distance.c
	$(CC) $(CFLAGS) $< -lm -o $@

game/%.js: game/%.ts node_modules/.bin/tsc
	./node_modules/.bin/tsc --lib es2015,dom $<

game/assets/libs/yalap-$(YALAP_VERSION)-unxz.js: node_modules/.bin/tsc
	mkdir -p game/assets/libs
	cp \
		node_modules/yalap.js/dist/yalap-$(YALAP_VERSION)-unxz.js \
		node_modules/yalap.js/dist/yalap-$(YALAP_VERSION)-unxz.wasm \
		node_modules/yalap.js/dist/yalap-$(YALAP_VERSION)-unxz.wasm.js \
		game/assets/libs/

node_modules/.bin/tsc:
	npm install
