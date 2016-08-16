/* -*- indent-tabs-mode: nil -*- */
'use strict';

var fs = require('fs');
var path = require('path');

var semverLooping = false;

var semverRequire = function (parentModule, packageId) {
    // Unfortunately, we run into a sort of infinite loop problem (I
    // think, actually haven’t tried myself) when trying to load
    // semver to parse our own dependencies. Therefore, we use a
    // simplified algorithm when we detect that we are loading the
    // semver module. This hack currently only supports the dependency
    // being specified as either “~MAJOR” or
    // “exact.string.match_pre20160816”. The hack follows:
    if (semverLooping
        && packageId === 'semver') {
        var semver = {
            compare: function (v1, v2) {
                if (v1 === v2) {
                    return 0;
                }
                var v1Components = v1.split('.');
                var v2Components = v2.split('.');
                // Probably breaks with _pre and such.
                for (var i in v1Components) {
                    var v1Component = v1Components[i]|0;
                    var v2Component = v2Components[i]|0;
                    if (v1Component > v2Component) {
                        // Choose v1
                        return 1;
                    }
                    if (v1Component < v2Component) {
                        // Choose v2
                        return -1;
                    }
                }
                return 0;
            },
            satisfies: function (version, matchExpression) {
                if (matchExpression === version) {
                    return true;
                }
                var tildeMatches = /~(.*)/.exec(matchExpression);
                if (tildeMatches) {
                    var expressionMajor = tildeMatches[1];
                    var versionMatches = /^v?([^.]*)/.exec(version);
                    if (versionMatches) {
                        var versionMajor = versionMatches[1];
                        return expressionMajor === versionMajor;
                    }
                }
                return false;
            },
            valid: function (version) {
                return /^[v0123456789]/.test(version);
            },
        };
    } else {
        try
        {
            semverLooping = true;
            semver = require('semver');
        }
        finally
        {
            semverLooping = false;
        }
    }

    // Scan the package.json for dependency expression. This is where
    // things get fun. Simply, it is too common of a pattern in nodejs
    // that one module’s function accepts a packageId and calls
    // require() on behalf of another module. In fact, that is exactly
    // what we’re doing in require-semver ;-). Thus we are going to
    // walk the entire require() chain if possible and *hope* against
    // hope that we find packageId listed as a dependency of at least
    // one of those modules, if not more. If we find multiple, we must
    // satisfy all of them because we don’t know which module the
    // require() is indirectly for. If we find none, we just hope that
    // the newest one is good… Because we really don’t have a way to
    // know for sure what packge.json should be checked.
    var dependencyKeys = ['dependencies', 'devDependencies', ];
    var versionConstraints = [];
    var visitingModule = parentModule;
    while (visitingModule) {
        var packageJson = visitingModule.require('./package.json');
        for (var dependencyKey of dependencyKeys) {
            var dependencyExpression = (packageJson[dependencyKey] || {})[packageId];
            if (dependencyExpression) {
                versionConstraints.push(dependencyExpression);
            }
        }
        visitingModule = visitingModule.parent;
    }
    var combinedVersionConstraints = versionConstraints.join(' ');

    // Scan available versions.
    var versions = [];
    var versionsPath = path.dirname(parentModule.id);
    for (var version of fs.readdirSync(versionsPath)) {
        if (semver.valid(version)
            && fs.statSync(path.join(versionsPath, version)).isDirectory()) {
            versions.push(version);
        }
    }

    // Special case error: no versions found. That should be
    // impossible, *gasp*.
    if (!versions.length) {
        throw new Error('Error when searching for packageId=' + packageId + '. No versions are present in this repository at “' + versionsPath + '”. Is this semver-aware node_modules repository broken?');
    }

    // Sort.
    versions.sort(semver.compare);

    // Find the highest one which satisfies all of the constraints.
    var consideringVersions = versions.slice();
    while (true) {
        var consideringVersion = consideringVersions.pop();
        if (!consideringVersion) {
            // Out of versions to consider.
            throw new Error('Error when searching for packageId=' + packageId + ' satisfying “' + combinedVersionConstraints + '”. None of the available versions satisfied all of the constraints: ' + versions.join(' ') + '.');
        }
        if (semver.satisfies(consideringVersion, combinedVersionConstraints)) {
            return require(versionsPath + '/' + consideringVersion);
        }
    }
};

module.exports = semverRequire;
