#!/usr/bin/env bash

path_sh=$(cd "$( dirname "$0")" && pwd)/
cd "${path_sh}../lib" || exit
node build.js