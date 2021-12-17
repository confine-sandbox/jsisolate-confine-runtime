# JS Isolate Confine Runtime

[Confine](https://github.com/confine-sandbox/confine) runtime: Runs javascript in an isolate using [isolated-vm](https://github.com/laverdet/isolated-vm).

Install:

```
npm i jsisolate-confine-runtime
```

Typically this should be passed into [Confine](https://github.com/confine-sandbox/confine), but here are the constructor options:

```typescript
const runtime = new JsIsolateConfineRuntime({
  source: ArrayBuffer, // script source
  path: string, // the path to the script
  env: 'vanilla' | 'nodejs',
  module: 'cjs',
  globals: {
    // ... any globals you want to define
  },
  requires: {
    // ... any require overrides you want to define
    // a map of 'module-name' -> 'path'
  }
})
```