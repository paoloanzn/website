// Site-wide metadata.
//
// SITE_URL must be the canonical, absolute origin of the deployed site: it is
// used for the Atom feed, canonical links and OpenGraph tags, all of which
// require absolute URLs. Set it in the Cloudflare build environment (or export
// it locally) whenever the domain changes.
const url = (process.env.SITE_URL || "https://jolly-frog-b8bf.workers.dev")
  .trim()
  .replace(/\/+$/, "");

module.exports = {
  title: "Paolo Anzani",
  url,
  description: "all opinions are my own.",
  language: "en",
  author: {
    name: "Paolo Anzani",
    email: "paoloanzn@gmail.com",
  },
  feed: {
    subtitle: "Writing on programming, and whatever else holds my attention.",
    filename: "feed.xml",
    path: "/feed.xml",
    id: url,
  },
  gpg: {
    // Published at https://github.com/paoloanzn.gpg
    path: "/paoloanzn.gpg",
    fingerprint: "0551 8883 A068 010A 58E9  5413 14B7 786A 2415 E2A0",
    keyid: "14B7786A2415E2A0",
    type: "RSA 4096",
    created: "2026-07-22",
    expires: "2036-07-19",
  },
  social: {
    github: "https://github.com/paoloanzn",
    twitter: "https://x.com/paoloanzn",
    telegram: "https://t.me/paoloanzn",
    linkedin: "https://www.linkedin.com/in/paolo-anzani-a2b469366/",
  },
};
