import { watch } from "fs";
import { cp, mkdir, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { $ } from "bun";

const srcDir = "./src";
const distDir = "./dist";

type Browser = "firefox" | "chrome" | "safari";

const browsers: Browser[] = ["firefox", "chrome", "safari"];
const iconSizes = [16, 32, 48, 128];

// Safari build config
const safariConfig = {
  bundleIdentifier: "org.kiddokraft.ai-blocker",
  appName: "ai blocker",
  projectLocation: "./ai blocker",
};

// Invert a hex color
function invertColor(hex: string): string {
  const r = 255 - parseInt(hex.slice(1, 3), 16);
  const g = 255 - parseInt(hex.slice(3, 5), 16);
  const b = 255 - parseInt(hex.slice(5, 7), 16);
  return `#${r.toString(16).padStart(2, "0").toUpperCase()}${g.toString(16).padStart(2, "0").toUpperCase()}${b.toString(16).padStart(2, "0").toUpperCase()}`;
}

// Generate dark mode SVG by inverting colors
function invertSvgColors(svg: string): string {
  return svg.replace(/fill="#([0-9A-Fa-f]{6})"/g, (match, hex) => {
    return `fill="${invertColor("#" + hex)}"`;
  });
}

// Wrap flag SVG in a square viewBox, centered vertically
function makeSquareSvg(svg: string): string {
  // Extract viewBox dimensions from original SVG
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBoxMatch) return svg;

  const width = parseInt(viewBoxMatch[1]);
  const height = parseInt(viewBoxMatch[2]);
  const size = Math.max(width, height);
  const yOffset = (size - height) / 2;

  // Extract the inner content (everything inside the svg tag)
  const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!innerMatch) return svg;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(0, ${yOffset})">
${innerMatch[1]}
</g>
</svg>`;
}

// Generate Safari Xcode project using safari-web-extension-converter
async function generateSafariXcodeProject() {
  const { bundleIdentifier, appName, projectLocation } = safariConfig;
  const extensionPath = join(distDir, "safari");

  try {
    await rm(projectLocation, { recursive: true, force: true });
    await $`xcrun safari-web-extension-converter ${extensionPath} --project-location ${projectLocation} --app-name ${appName} --bundle-identifier ${bundleIdentifier} --swift --no-prompt --no-open --copy-resources`;
    console.log(`  → Xcode project generated at ${projectLocation}`);
    console.log(`  → Bundle identifier: ${bundleIdentifier}`);
  } catch (error) {
    console.error(`  → Failed to generate Xcode project:`, error);
  }
}

// Generate ZIP files for store submission
async function generateZipFiles() {
  const zipDir = join(distDir, "zip");
  await mkdir(zipDir, { recursive: true });

  // Create ZIP for Firefox
  await $`cd ${join(distDir, "firefox")} && zip -r ../zip/ai-blocker-firefox.zip .`;
  console.log("  → Created dist/zip/ai-blocker-firefox.zip");

  // Create ZIP for Chrome
  await $`cd ${join(distDir, "chrome")} && zip -r ../zip/ai-blocker-chrome.zip .`;
  console.log("  → Created dist/zip/ai-blocker-chrome.zip");
}

// Generate store screenshots/promotional images
async function generateStoreAssets() {
  const assetsDir = join(distDir, "store-assets");
  await mkdir(assetsDir, { recursive: true });

  // Read the source icon
  const svgPath = join(srcDir, "icons", "icon.svg");
  const iconSvg = await readFile(svgPath, "utf-8");

  // Create a promotional image (1280x800 for Chrome, also works for Firefox)
  const promoSvg = `<svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="800" fill="#1a1a2e"/>
  <g transform="translate(440, 200)">
    <rect width="400" height="277" rx="8" fill="#00A3FF"/>
    <rect y="168" width="400" height="109" fill="#8BD450"/>
  </g>
  <text x="640" y="560" text-anchor="middle" font-family="system-ui, sans-serif" font-size="64" font-weight="bold" fill="white">ai blocker</text>
  <text x="640" y="620" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" fill="#888">customizable ai blocking</text>
</svg>`;

  // Small tile (440x280 for Chrome)
  const smallTileSvg = `<svg width="440" height="280" viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
  <rect width="440" height="280" fill="#1a1a2e"/>
  <g transform="translate(145, 40)">
    <rect width="150" height="104" rx="4" fill="#00A3FF"/>
    <rect y="63" width="150" height="41" fill="#8BD450"/>
  </g>
  <text x="220" y="190" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" font-weight="bold" fill="white">ai blocker</text>
  <text x="220" y="230" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#888">customizable ai blocking</text>
</svg>`;

  // Marquee (1400x560 for Chrome)
  const marqueeSvg = `<svg width="1400" height="560" viewBox="0 0 1400 560" xmlns="http://www.w3.org/2000/svg">
  <rect width="1400" height="560" fill="#1a1a2e"/>
  <g transform="translate(100, 130)">
    <rect width="300" height="208" rx="8" fill="#00A3FF"/>
    <rect y="126" width="300" height="82" fill="#8BD450"/>
  </g>
  <text x="850" y="260" text-anchor="middle" font-family="system-ui, sans-serif" font-size="72" font-weight="bold" fill="white">ai blocker</text>
  <text x="850" y="340" text-anchor="middle" font-family="system-ui, sans-serif" font-size="32" fill="#888">customizable ai blocking</text>
</svg>`;

  // Write SVGs and convert to PNG
  await writeFile(join(assetsDir, "screenshot-1280x800.svg"), promoSvg);
  await writeFile(join(assetsDir, "small-tile-440x280.svg"), smallTileSvg);
  await writeFile(join(assetsDir, "marquee-1400x560.svg"), marqueeSvg);

  await $`rsvg-convert -w 1280 -h 800 ${join(assetsDir, "screenshot-1280x800.svg")} -o ${join(assetsDir, "screenshot-1280x800.png")}`;
  await $`rsvg-convert -w 440 -h 280 ${join(assetsDir, "small-tile-440x280.svg")} -o ${join(assetsDir, "small-tile-440x280.png")}`;
  await $`rsvg-convert -w 1400 -h 560 ${join(assetsDir, "marquee-1400x560.svg")} -o ${join(assetsDir, "marquee-1400x560.png")}`;

  console.log("  → Created store assets in dist/store-assets/");
}

async function generateIcons(outDir: string) {
  const iconsDir = join(outDir, "icons");
  await mkdir(iconsDir, { recursive: true });

  // Read source SVG and make it square
  const svgPath = join(srcDir, "icons", "icon.svg");
  const originalSvg = await readFile(svgPath, "utf-8");
  const lightSvg = makeSquareSvg(originalSvg);
  const darkSvg = invertSvgColors(lightSvg);

  // Write SVG files
  const lightSvgPath = join(iconsDir, "icon-light.svg");
  const darkSvgPath = join(iconsDir, "icon-dark.svg");
  await writeFile(lightSvgPath, lightSvg);
  await writeFile(darkSvgPath, darkSvg);

  // Generate square PNGs using rsvg-convert
  for (const size of iconSizes) {
    await $`rsvg-convert -w ${size} -h ${size} ${lightSvgPath} -o ${join(iconsDir, `icon-light-${size}.png`)}`;
    await $`rsvg-convert -w ${size} -h ${size} ${darkSvgPath} -o ${join(iconsDir, `icon-dark-${size}.png`)}`;
  }
}

async function buildForBrowser(browser: Browser) {
  const outDir = join(distDir, browser);

  // Clean and create output directory
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Build TypeScript files
  const entrypoints = [
    join(srcDir, "background.ts"),
    join(srcDir, "content.ts"),
    join(srcDir, "popup.ts"),
  ];

  const result = await Bun.build({
    entrypoints,
    outdir: outDir,
    target: "browser",
    format: "esm",
    minify: false,
  });

  if (!result.success) {
    console.error(`Build failed for ${browser}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  // Copy manifest for this browser
  await cp(
    join(srcDir, "manifests", `${browser}.json`),
    join(outDir, "manifest.json")
  );

  // Copy static files
  await cp(join(srcDir, "popup.html"), join(outDir, "popup.html"));
  await cp(join(srcDir, "blocked-words.txt"), join(outDir, "blocked-words.txt"));

  // Generate icons
  await generateIcons(outDir);

  // Generate Safari Xcode project
  if (browser === "safari") {
    await generateSafariXcodeProject();
  }

  console.log(`✓ Built for ${browser}`);
  return true;
}

async function build() {
  console.log("building ai blocker extension...\n");

  const browsersToBuild = skipSafari ? browsers.filter(b => b !== "safari") : browsers;

  let allSuccess = true;
  for (const browser of browsersToBuild) {
    const success = await buildForBrowser(browser);
    if (!success) allSuccess = false;
  }

  if (allSuccess) {
    // Generate ZIP files and store assets
    console.log("\nGenerating store packages...");
    await generateZipFiles();
    await generateStoreAssets();

    console.log("\n✓ build completed successfully!");
    console.log("\noutput:");
    console.log("  - dist/firefox/           (extension files)");
    console.log("  - dist/chrome/            (extension files)");
    if (!skipSafari) {
      console.log("  - dist/safari/            (extension files)");
    }
    console.log("  - dist/zip/               (store submission zips)");
    console.log("  - dist/store-assets/      (screenshots & promo images)");
    console.log("\ninstallation:");
    console.log("  firefox: about:debugging → load temporary add-on → dist/firefox/manifest.json");
    console.log("  chrome:  chrome://extensions → developer mode → load unpacked → dist/chrome/");
    if (!skipSafari) {
      console.log("  safari:  open 'ai blocker/ai blocker/ai blocker.xcodeproj' in xcode and build");
    }
    console.log("\nstore submission:");
    console.log("  firefox: upload dist/zip/ai-blocker-firefox.zip to addons.mozilla.org");
    console.log("  chrome:  upload dist/zip/ai-blocker-chrome.zip to chrome.google.com/webstore");
  }
}

// Check for flags
const isWatch = process.argv.includes("--watch");
const skipSafari = process.argv.includes("--skip-safari");

await build();

if (isWatch) {
  console.log("\nWatching for changes...");
  watch(srcDir, { recursive: true }, async (event, filename) => {
    if (filename?.includes("manifests/")) {
      const match = filename.match(/manifests\/(\w+)\.json/);
      if (match) {
        console.log(`\nManifest changed: ${filename}`);
        await buildForBrowser(match[1] as Browser);
      }
    } else {
      console.log(`\nFile changed: ${filename}`);
      await build();
    }
  });
}
