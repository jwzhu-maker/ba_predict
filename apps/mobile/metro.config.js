/*
 * Metro in an npm-workspaces monorepo.
 *
 * Without this the bundler never sees @ba-predict/engine or
 * @ba-predict/app-core: they are hoisted to the repo root and symlinked into
 * this app, which is outside Metro's default watch root. Three settings make
 * it work, and all three are load-bearing:
 *
 *   - watchFolders adds the workspace root, so the shared packages' TypeScript
 *     is both resolvable and transformed by babel-preset-expo;
 *   - nodeModulesPaths names both node_modules directories, since npm hoists
 *     most dependencies to the root while leaving some here;
 *   - disableHierarchicalLookup stops Metro walking up the tree on its own,
 *     which otherwise resolves a second copy of React and produces the
 *     "invalid hook call" failure that is very hard to read backwards.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
