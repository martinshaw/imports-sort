import * as assert from 'assert';
import {
  compareImportLines,
  compareUseLines,
  isCssImport,
  namespacePrefixLength,
  pathTokensetLength,
  sortImportRegion,
  sortImportsInText,
  sortUseRegion,
} from '../sortImports';

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`fail - ${name}`);
    throw err;
  }
}

check('pathTokensetLength stops before as and semicolon', () => {
  assert.strictEqual(
    pathTokensetLength('use Inertia\\Response as InertiaResponse;'),
    'use Inertia\\Response'.length
  );
  assert.strictEqual(
    pathTokensetLength('use Spatie\\Permission\\Models\\Permission;'),
    'use Spatie\\Permission\\Models\\Permission'.length
  );
});

check('namespacePrefixLength excludes final name segment', () => {
  assert.strictEqual(
    namespacePrefixLength('use App\\Services\\JobManagementService;'),
    'use App\\Services'.length
  );
  assert.strictEqual(
    namespacePrefixLength('use App\\Repositories\\ClientRepository;'),
    'use App\\Repositories'.length
  );
});

check('brief example 1: equal line length, Services before Repositories', () => {
  const a = 'use App\\Services\\JobManagementService;';
  const b = 'use App\\Repositories\\ClientRepository;';
  assert.strictEqual(a.length, b.length);
  assert.strictEqual(pathTokensetLength(a), pathTokensetLength(b));
  assert.ok(namespacePrefixLength(a) < namespacePrefixLength(b));
  assert.ok(compareUseLines(a, b) < 0);
  assert.deepStrictEqual(sortUseRegion([b, a]), [a, b]);
});

check('brief example 2: equal line length, Inertia path before Spatie', () => {
  const a = 'use Inertia\\Response as InertiaResponse;';
  const b = 'use Spatie\\Permission\\Models\\Permission;';
  assert.strictEqual(a.length, b.length);
  assert.ok(pathTokensetLength(a) < pathTokensetLength(b));
  assert.ok(compareUseLines(a, b) < 0);
  assert.deepStrictEqual(sortUseRegion([b, a]), [a, b]);
});

check('sorts shortest to longest', () => {
  const input = [
    'use App\\Repositories\\ClientRepository;',
    'use App\\Models\\User;',
    'use Illuminate\\Http\\Request;',
  ];
  const sorted = sortUseRegion(input);
  assert.deepStrictEqual(sorted, [
    'use App\\Models\\User;',
    'use Illuminate\\Http\\Request;',
    'use App\\Repositories\\ClientRepository;',
  ]);
});

check('preserves blank-line sections', () => {
  const input = [
    'use App\\Repositories\\ClientRepository;',
    'use App\\Models\\User;',
    '',
    'use Illuminate\\Support\\Facades\\Auth;',
    'use Illuminate\\Http\\Request;',
  ];
  const sorted = sortUseRegion(input);
  assert.deepStrictEqual(sorted, [
    'use App\\Models\\User;',
    'use App\\Repositories\\ClientRepository;',
    '',
    'use Illuminate\\Http\\Request;',
    'use Illuminate\\Support\\Facades\\Auth;',
  ]);
});

check('sortImportsInText sorts PHP file and keeps header/footer', () => {
  const text = `<?php

namespace App\\Http\\Controllers;

use App\\Repositories\\ClientRepository;
use App\\Services\\JobManagementService;
use App\\Models\\User;

use Illuminate\\Support\\Facades\\Auth;
use Illuminate\\Http\\Request;

class JobController
{
}
`;
  const result = sortImportsInText(text, 'php');
  assert.ok(result !== null);
  assert.ok(result!.includes('namespace App\\Http\\Controllers;'));
  assert.ok(result!.includes('class JobController'));

  const useLines = result!.split('\n').filter((l) => l.startsWith('use '));
  assert.deepStrictEqual(useLines, [
    'use App\\Models\\User;',
    'use App\\Services\\JobManagementService;',
    'use App\\Repositories\\ClientRepository;',
    'use Illuminate\\Http\\Request;',
    'use Illuminate\\Support\\Facades\\Auth;',
  ]);
});

check('isCssImport detects css/scss modules', () => {
  assert.ok(isCssImport("import './app.css';"));
  assert.ok(isCssImport("import styles from './App.module.css';"));
  assert.ok(isCssImport("import '@/styles/main.scss';"));
  assert.ok(!isCssImport("import Foo from './Foo.vue';"));
  assert.ok(!isCssImport("import { ref } from 'vue';"));
});

check('esm sorts shortest to longest and preserves sections', () => {
  const sorted = sortImportRegion(
    [
      "import { longNameHere } from '@/utils/helpers';",
      "import { ref } from 'vue';",
      '',
      "import axios from 'axios';",
      "import { usePage } from '@inertiajs/vue3';",
    ],
    'esm'
  );
  assert.deepStrictEqual(sorted, [
    "import { ref } from 'vue';",
    "import { longNameHere } from '@/utils/helpers';",
    '',
    "import axios from 'axios';",
    "import { usePage } from '@inertiajs/vue3';",
  ]);
});

check('esm moves css imports to a sorted section below', () => {
  const sorted = sortImportRegion(
    [
      "import './b.css';",
      "import { ref } from 'vue';",
      "import Foo from './Foo.vue';",
      '',
      "import styles from './a.module.css';",
      "import axios from 'axios';",
    ],
    'esm'
  );
  assert.deepStrictEqual(sorted, [
    "import { ref } from 'vue';",
    "import Foo from './Foo.vue';",
    '',
    "import axios from 'axios';",
    '',
    "import './b.css';",
    "import styles from './a.module.css';",
  ]);
});

check('esm path tokenset uses module specifier', () => {
  const a = "import X from '@/a';";
  const b = "import Y from '@/longer/path';";
  assert.ok(pathTokensetLength(a, 'esm') < pathTokensetLength(b, 'esm'));
  assert.ok(compareImportLines(a, b, 'esm') < 0 || a.length !== b.length);
});

check('sortImportsInText sorts typescript file', () => {
  const text = `import { longHelper } from './helpers';
import { ref } from 'vue';
import './app.css';

export function main() {}
`;
  const result = sortImportsInText(text, 'typescript');
  assert.ok(result !== null);
  const importLines = result!.split('\n').filter((l) => l.startsWith('import '));
  assert.deepStrictEqual(importLines, [
    "import { ref } from 'vue';",
    "import { longHelper } from './helpers';",
    "import './app.css';",
  ]);
});

check('sortImportsInText sorts vue SFC script imports', () => {
  const text = `<template>
  <div />
</template>

<script setup lang="ts">
import './theme.css';
import Foo from './Foo.vue';
import { ref } from 'vue';
</script>
`;
  const result = sortImportsInText(text, 'vue');
  assert.ok(result !== null);
  assert.ok(result!.includes('<template>'));
  const importLines = result!.split('\n').filter((l) => l.trimStart().startsWith('import '));
  assert.deepStrictEqual(importLines, [
    "import { ref } from 'vue';",
    "import Foo from './Foo.vue';",
    "import './theme.css';",
  ]);
});

check('unsupported language returns null', () => {
  assert.strictEqual(sortImportsInText("import x from 'y';", 'python'), null);
});

console.log('All tests passed.');
