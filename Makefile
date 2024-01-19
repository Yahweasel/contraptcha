CC=gcc
CFLAGS=-O3

all: semantic-distance/distance game/contraptcha.js

semantic-distance/distance: semantic-distance/distance.c
	$(CC) $(CFLAGS) $< -lm -o $@

game/%.js: game/%.ts node_modules/.bin/tsc
	./node_modules/.bin/tsc --lib es2015,dom $<

node_modules/.bin/tsc:
	npm install
