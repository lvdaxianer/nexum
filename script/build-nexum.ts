import { mkdir, readdir, rm } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import babel from "@babel/core"
import presetEnv from "@babel/preset-env"
import presetTypescript from "@babel/preset-typescript"
import presetSolid from "babel-preset-solid"
import {
  artifactRoot,
  declarationPath,
  outputPath,
  publicEntries,
  releasePackageName,
  releasePackageTag,
  releasePackageVersion,
  workspacePackageToSubpath,
} from "./nexum-package"

const externalDependencies = ["@modelcontextprotocol/sdk", "dompurify", "marked", "solid-js"]
const solidSurfaceBanner = String.raw`import { SVGElements as compatSVGElements, dynamicProperty as compatDynamicProperty, createComponent as compatCreateComponent, insert as compatInsert, assign as compatAssign, spread as compatSpread } from "solid-js/web";
const $ELEMENT = Symbol("hyper-element");
function createCompatHyperScript(r) {
  function h() {
    let args = [].slice.call(arguments), e, classes = [], multiExpression = false;
    while (Array.isArray(args[0])) args = args[0];
    if (args[0][$ELEMENT]) args.unshift(h.Fragment);
    typeof args[0] === "string" && detectMultiExpression(args);
    const ret = () => {
      while (args.length) item(args.shift());
      if (e instanceof Element && classes.length) e.classList.add(...classes);
      return e;
    };
    ret[$ELEMENT] = true;
    return ret;
    function item(l) {
      const type = typeof l;
      if (l == null) ;
      else if (type === "string") {
        if (!e) parseClass(l); else e.appendChild(document.createTextNode(l));
      } else if (type === "number" || type === "boolean" || type === "bigint" || type === "symbol" || l instanceof Date || l instanceof RegExp) {
        e.appendChild(document.createTextNode(l.toString()));
      } else if (Array.isArray(l)) {
        for (let i = 0; i < l.length; i++) item(l[i]);
      } else if (l instanceof Element) {
        compatInsert(e, l, multiExpression ? null : undefined);
      } else if (type === "object") {
        let dynamic = false;
        const d = Object.getOwnPropertyDescriptors(l);
        for (const k in d) {
          if (k === "class" && classes.length !== 0) {
            const fixedClasses = classes.join(" ");
            const value = typeof d[k].value === "function" ? () => fixedClasses + " " + d[k].value() : fixedClasses + " " + l[k];
            Object.defineProperty(l, "class", { ...d[k], value });
            classes = [];
          }
          if (k !== "ref" && k.slice(0, 2) !== "on" && typeof d[k].value === "function") {
            compatDynamicProperty(l, k);
            dynamic = true;
          } else if (d[k].get) dynamic = true;
        }
        dynamic ? compatSpread(e, l, e instanceof SVGElement, !!args.length) : compatAssign(e, l, e instanceof SVGElement, !!args.length);
      } else if (type === "function") {
        if (!e) {
          let props, next = args[0];
          if (next == null || typeof next === "object" && !Array.isArray(next) && !(next instanceof Element)) props = args.shift();
          props || (props = {});
          if (args.length) props.children = args.length > 1 ? args : args[0];
          const d = Object.getOwnPropertyDescriptors(props);
          for (const k in d) {
            if (Array.isArray(d[k].value)) {
              const list = d[k].value;
              props[k] = () => {
                for (let i = 0; i < list.length; i++) while (list[i][$ELEMENT]) list[i] = list[i]();
                return list;
              };
              compatDynamicProperty(props, k);
            } else if (typeof d[k].value === "function" && !d[k].value.length && k !== "ref" && k !== "anchorRef" && !k.startsWith("on")) {
              compatDynamicProperty(props, k);
            }
          }
          e = compatCreateComponent(l, props);
          args = [];
        } else {
          while (l[$ELEMENT]) l = l();
          compatInsert(e, l, multiExpression ? null : undefined);
        }
      }
    }
    function parseClass(string) {
      const m = string.split(/([.#]?[^\\s#.]+)/);
      if (/^[.#]/.test(m[1])) e = document.createElement("div");
      for (let i = 0; i < m.length; i++) {
        const v = m[i], s = v.substring(1);
        if (!v) continue;
        if (!e) e = compatSVGElements.has(v) ? document.createElementNS("http://www.w3.org/2000/svg", v) : document.createElement(v);
        else if (v[0] === ".") classes.push(s); else if (v[0] === "#") e.setAttribute("id", s);
      }
    }
    function detectMultiExpression(list) {
      for (let i = 1; i < list.length; i++) {
        if (typeof list[i] === "function") { multiExpression = true; return; }
        if (Array.isArray(list[i])) detectMultiExpression(list[i]);
      }
    }
  }
  h.Fragment = props => props.children;
  return h;
}
const h = createCompatHyperScript({ spread: compatSpread, assign: compatAssign, insert: compatInsert, createComponent: compatCreateComponent, dynamicProperty: compatDynamicProperty, SVGElements: compatSVGElements });
const Fragment = h.Fragment;`

const solidTransformPlugin = {
  name: "nexum-solid-dom-compiler",
  setup(build: {
    onLoad: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => Promise<{ contents: string; loader: "js"; resolveDir: string }>,
    ) => void
  }) {
    build.onLoad({ filter: /\.(?:tsx|jsx|ts)$/ }, async ({ path }) => {
      const source = await Bun.file(path).text()
      const transformed = await babel.transformAsync(source, {
        filename: path,
        sourceType: "module",
        configFile: false,
        babelrc: false,
        presets: [
          [presetSolid, { generate: "dom", hydratable: false }],
          [presetTypescript, { onlyRemoveTypeImports: true }],
        ],
      })
      if (!transformed?.code) throw new Error(`Solid 编译未生成代码: ${path}`)
      return { contents: transformed.code, loader: "js", resolveDir: dirname(path) }
    })
  },
}

await rm(artifactRoot, { recursive: true, force: true })
await mkdir(join(artifactRoot, "dist"), { recursive: true })

for (const [subpath, entry] of Object.entries(publicEntries)) {
  const isSolidSurfaceEntry = subpath === "./chat-surface"
  const result = await Bun.build({
    entrypoints: [resolve(process.cwd(), entry.source)],
    outfile: outputPath(entry),
    target: isSolidSurfaceEntry ? "browser" : "bun",
    format: "esm",
    packages: "bundle",
    external: externalDependencies,
    plugins: isSolidSurfaceEntry ? [solidTransformPlugin] : undefined,
    sourcemap: "none",
    minify: false,
  })
  if (!result.success) {
    throw new Error(`构建 ${subpath} 失败:\n${result.logs.map((log) => log.message).join("\n")}`)
  }
  if (result.outputs.length !== 1) throw new Error(`${subpath} 构建产物数量异常: ${result.outputs.length}`)
  await Bun.write(outputPath(entry), await result.outputs[0].arrayBuffer())
  const compiled = await Bun.file(outputPath(entry)).text()
  const stripped = compiled.replace(/^\/\/ packages\/.*\r?\n/gm, "")
  const lowered = await babel.transformAsync(stripped, {
    configFile: false,
    babelrc: false,
    sourceType: "module",
    presets: [[presetEnv, { bugfixes: true, modules: false, targets: { chrome: "61", edge: "16", firefox: "60", safari: "11" } }]],
  })
  if (!lowered?.code) throw new Error(`低版本语法编译未生成代码: ${subpath}`)
  await Bun.write(outputPath(entry), lowered.code)
  console.log(`built ${subpath} -> ${relative(process.cwd(), outputPath(entry))}`)
}

const chatSurfaceStyles = await Bun.file("packages/nexum-chat-surface/src/styles.css").text()
await Bun.write(join(artifactRoot, "dist", "chat-surface.css"), chatSurfaceStyles)

for (const [subpath, entry] of Object.entries(publicEntries)) {
  if (subpath === ".") {
    await Bun.write(declarationPath(entry), `export * from "./application.js"\nexport * from "./client.js"\nexport * from "./server.js"\nexport * from "./protocol.js"\n`)
    continue
  }
  const sourceRoot = dirname(entry.source)
  const temporaryTypes = join(artifactRoot, ".types", entry.output)
  const entryDeclarationName = basename(entry.source).replace(/\.(tsx?|mts|cts)$/, ".d.ts")
  await mkdir(temporaryTypes, { recursive: true })
  const command = [
    "bunx",
    "--bun",
    "tsc",
    "--declaration",
    "--emitDeclarationOnly",
    "--declarationMap",
    "false",
    "--skipLibCheck",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ES2022",
    "--jsx",
    "preserve",
    "--jsxImportSource",
    "solid-js",
    "--lib",
    "ESNext,DOM,DOM.Iterable",
    "--allowImportingTsExtensions",
    "--types",
    "bun",
    "--ignoreConfig",
    "--rootDir",
    resolve(process.cwd(), sourceRoot),
    "--outDir",
    temporaryTypes,
    resolve(process.cwd(), entry.source),
  ]
  const typecheck = Bun.spawnSync(command, { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" })
  if (typecheck.exitCode !== 0) {
    throw new Error(
      `生成 ${subpath} 类型声明失败:\n${new TextDecoder().decode(typecheck.stdout)}${new TextDecoder().decode(typecheck.stderr)}`,
    )
  }
  const generated = await findDeclaration(temporaryTypes, entryDeclarationName)
  if (!generated) throw new Error(`没有找到 ${subpath} 的入口声明`)
  await copyDeclarations(temporaryTypes, join(artifactRoot, "dist", entry.output))
  await Bun.write(
    declarationPath(entry),
    `export * from "./${entry.output}/${entryDeclarationName.replace(/\.d\.ts$/, ".js")}"\n`,
  )
}

const manifest = {
  name: releasePackageName,
  version: releasePackageVersion,
  description: "Composable, UI-agnostic Agent Runtime",
  type: "module",
  engines: { bun: ">=1.4.4" },
  repository: { type: "git", url: "git+https://github.com/lvdaxianer/nexum.git" },
  homepage: "https://github.com/lvdaxianer/nexum",
  bugs: { url: "https://github.com/lvdaxianer/nexum/issues" },
  keywords: ["agent", "runtime", "ai", "bun"],
  publishConfig: { tag: releasePackageTag },
  bin: { nexum: "dist/cli.js" },
  exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" },
    ...Object.fromEntries(
      Object.entries(publicEntries)
        .filter(([subpath]) => subpath !== ".")
        .map(([subpath, entry]) => [
          subpath,
          { types: `./dist/${entry.output}.d.ts`, import: `./dist/${entry.output}.js`, default: `./dist/${entry.output}.js` },
        ]),
    ),
    "./chat-surface/styles.css": "./dist/chat-surface.css",
  },
  files: ["dist", "README.md", "LICENSE"],
  dependencies: {
    "@modelcontextprotocol/sdk": "1.32.1",
    "@types/bun": "1.4.3",
    "bun-types": "1.4.4",
    dompurify: "3.4.17",
    marked: "18.0.11",
    "solid-js": "1.9.17",
  },
  license: "MIT",
} as const

await Bun.write(join(artifactRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await Bun.write(join(artifactRoot, "README.md"), Bun.file("README.md"))
await Bun.write(join(artifactRoot, "LICENSE"), Bun.file("LICENSE"))

await rewriteDeclarations()
await rm(join(artifactRoot, ".types"), { recursive: true, force: true })
console.log(`nexum package built at ${relative(process.cwd(), artifactRoot)}`)

async function findDeclaration(directory: string, name: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = await findDeclaration(path, name)
      if (found) return found
    }
    if (entry.isFile() && entry.name === name) return path
  }
  return undefined
}

async function copyDeclarations(source: string, target: string) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) {
      await copyDeclarations(from, to)
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".d.ts")) await Bun.write(to, Bun.file(from))
  }
}

async function rewriteDeclarations() {
  for (const file of await Array.fromAsync(new Bun.Glob("dist/**/*.d.ts").scan({ cwd: artifactRoot, onlyFiles: true }))) {
    const path = join(artifactRoot, file)
    const original = await Bun.file(path).text()
    const rewritten = original
      .replace(/@nexum\/[a-z0-9-]+(?:\/internal)?(?:\/[a-z0-9-]+)*/g, (name) => {
        const base = name.match(/^@nexum\/[a-z0-9-]+/)?.[0]
        if (!base) return name
        const subpath = workspacePackageToSubpath[base as keyof typeof workspacePackageToSubpath]
        if (!subpath) return name
        const suffix = name.slice(base.length)
        return `${subpath}${suffix}`
      })
      .replace(/nexum-ai\/persistence\/internal\/([a-z0-9-]+)/g, "../persistence/$1.js")
      .replace(/(["'])(\.\.?\/[^"']+)\1/g, (match, quote: string, specifier: string) => {
        if (specifier.endsWith(".js") || specifier.endsWith(".json")) return match
        if (specifier.endsWith(".ts") || specifier.endsWith(".tsx")) {
          return `${quote}${specifier.replace(/\.tsx?$/, ".js")}${quote}`
        }
        return `${quote}${specifier}.js${quote}`
      })
    await Bun.write(path, rewritten)
  }
}
