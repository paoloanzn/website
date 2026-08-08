// Reads the armoured public key at build time so the /gpg page and the raw
// .gpg file can never drift apart. Source of truth is paoloanzn.gpg in the
// repo root, which mirrors https://github.com/paoloanzn.gpg
const fs = require("node:fs");
const path = require("node:path");

module.exports = () =>
  fs.readFileSync(path.join(__dirname, "..", "paoloanzn.gpg"), "utf8").trim();
