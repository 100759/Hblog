// https://vitepress.dev/guide/data-loading
import { createContentLoader } from "vitepress";
import readingTime from "reading-time";
import extendedConfig from "../config.theme";
import { appEnv, withBaseURL } from "../config.utils";
import getLocation from "./locations";

// Title Workaround
function extractTitle(text: string) {
  const titlePattern = /---\r?\n\r?\n# (?<title>.*)\r?\n/;
  const match = text.match(titlePattern);
  return match?.groups?.title || "Untitled";
}

function transformRawData(rawData) {
  return rawData
    .map(p => {
      const rt = readingTime(p.src || "");
      const mdpath = p.url.replace("/README", "");
      p.url = withBaseURL(mdpath);
      p.frontmatter.title = extractTitle(p.src || "");
      p.frontmatter.datetime = new Date(p.frontmatter.date);
      p.frontmatter.location = getLocation(p.frontmatter.spot);
      p.frontmatter.readingTime = rt.text;
      p.frontmatter.words = rt.words;
      p.frontmatter.mdpath = mdpath;
      return p;
    })
    .filter(p => !appEnv.isProduction || !p.frontmatter.draft)
    .sort((a, b) => {
      return b.frontmatter.datetime - a.frontmatter.datetime;
    });
}

export default async (options) => {
  const {
    includeSrc = true,
    render = false,
    excerpt = false,
  } = options;

  return createContentLoader(extendedConfig.mdfilePatterns, {
    includeSrc,
    render,
    excerpt,
    transform: transformRawData
  });
};
