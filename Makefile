.PHONY: install test lint typecheck contract build clean

node_modules:
	npm install --no-fund --no-audit

install: node_modules

test: node_modules
	npm test

lint: node_modules
	npm run typecheck

typecheck: node_modules
	npm run typecheck

contract: node_modules
	npm run contract

build: node_modules
	npm run build

clean:
	rm -rf node_modules dist
