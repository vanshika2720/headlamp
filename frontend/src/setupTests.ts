/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import indexeddb from 'fake-indexeddb';

// Nock v14 uses @mswjs/interceptors which internally calls `new Request(url, init)` when
// intercepting fetch. In jsdom v24+, `globalThis.Request` wraps undici's native Request,
// which validates that `init.signal instanceof nativeAbortSignal`. But jsdom provides its
// own AbortController whose signals fail that native instanceof check.
// This patch wraps globalThis.Request so that if construction fails due to an incompatible
// AbortSignal, it retries without the signal. Because setupFiles run before test-file imports,
// this patch is in place before nock activates and wraps globalThis.Request.
if (typeof Request !== 'undefined') {
  const OriginalRequest = globalThis.Request;
  globalThis.Request = new Proxy(OriginalRequest, {
    construct(target, args, newTarget) {
      const [input, init] = args as [any, RequestInit | undefined];
      if (init?.signal) {
        try {
          return Reflect.construct(target, args, newTarget);
        } catch (e: any) {
          if (typeof e?.message === 'string' && e.message.includes('AbortSignal')) {
            const restInit = { ...init };
            delete (restInit as RequestInit & { signal?: unknown }).signal;
            return Reflect.construct(target, [input, restInit], newTarget);
          }
          throw e;
        }
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
}

globalThis.indexedDB = indexeddb;

if (typeof TextDecoder === 'undefined' && typeof require !== 'undefined') {
  (global as any).TextDecoder = require('util').TextDecoder;
}
if (typeof TextEncoder === 'undefined' && typeof require !== 'undefined') {
  (global as any).TextEncoder = require('util').TextEncoder;
}
if (typeof ResizeObserver === 'undefined' && typeof require !== 'undefined') {
  (global as any).ResizeObserver = require('resize-observer-polyfill');
}

globalThis.Worker = class {
  postMessage() {}
} as any;

if (globalThis.window) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (globalThis.window) {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  // Clears the database and adds some testing data.
  // Jest will wait for this promise to resolve before running tests.
  localStorage.clear();
});
