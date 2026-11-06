import React from "react";
import { renderToString } from "react-dom/server";
import SiteDocument from "../src/SiteDocument";
import { sitePages } from "../src/site-pages.mjs";

export function renderPage(path: string) {
  return renderToString(<SiteDocument page={sitePages.find(page => page.path === path)} language="zh"/>);
}
