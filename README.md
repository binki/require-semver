An alternative way of organizing `node_modules` and searching for
dependencies which respects a package’s version requests with support
for slotting.

## The Problem

You want to use different software packages which require different
major API versions of npm packages and share the library storage.
Reasons you might want to share library storage:

1. So that all packages using a particular npm package can benefit
   from bugfixes including security patches.

2. To save disk space without needing to use FS-level file
   deduplication.

The current `node_modules` directory structure does not support this
at all.
It has a weird recursion where each module in `node_modules` can
contain yet other `node_modules`, enabling further duplication.
Also, if you need to use two different packages which demand different
major API versions of the same package, these different major API
version packages cannot exist in the same `node_modules` repository
because modules are stored directly by name.

## Possible Solution

Instead of storing packages like `node_modules/«moduleId»`, store them
like `node_modules/«moduleId»/«version»`.
This enables the list of available versions to be collected by listing
the `node_modules/«moduleId»` directory, logic to choose a version
compatible with the package calling `require`, and then actual
loading.

There are two steps to using `require-semver`.

1. Ensure your `node_modules` contains `require-semver`:

        $ npm install require-semver

   This is necessary because the changed repository format’s shims rely on `require-semver`.

2. Fix your `node_modules` directory to use the changed repository format and place shims.
   This package provides the tool `require-semver-fixdir` to do that for you.
   Simply run it in the directory containing node_modules.

        user@hostname ~/my-app $ require-semver-fixdir

   The altered repository will store original packages at `node_modules/«moduleId»/«version»`.
   It will also insert a stub package at `node_modules/«moduleId»` which delegates to `require-semver` (which you installed in the first step) which resolves and `require()`s the real module.

## Expected Incompatibilities

A lot of npm packages in the wild treat the `node_modules` structure
as if it were part of node’s public API.
In fact, `require-semver-fixder` assumes a particular implementation
when rearranging things, though hopefully this is just a temporary
hack and a real solution will be provided by npm itself in the future.
But there are packages such as grunt which [make broken assumptions
which cannot be made compatible with a changed directory
structure](https://github.com/gruntjs/grunt/issues/696), [another
discussion](https://github.com/gruntjs/grunt/issues/1312).
