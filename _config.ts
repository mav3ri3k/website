import lume from "lume/mod.ts";
import googleFonts from "lume/plugins/google_fonts.ts";
import favicon from "lume/plugins/favicon.ts";
import date from "lume/plugins/date.ts";

const site = lume({
  src: "./src",
  dest: "./output",
  location: new URL("https://posts.apurva-mishra.com"),
});

site.add("/styles.css");

site.use(googleFonts({
  fonts: {
    garamond: "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..800;1,400..800",
    jetbrains: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800"
    }
}));

site.use(favicon({
  input: "/favicon.svg",
}));

site.use(date(/* Options */));

export default site;
