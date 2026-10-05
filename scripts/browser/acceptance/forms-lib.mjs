// Helpers for driving the Builder's schema-driven forms the way an author does:
// by visible labels, "Add …" buttons and union "kind" selects — never JSON.
import { sleep } from "./cdp.mjs";

export function forms(b) {
  const js = (s) => JSON.stringify(s);
  // An element that scopes the search: a fieldset by legend, a details by summary, or a CSS selector.
  const scopeExpr = (scope) =>
    !scope ? "document"
    : scope.legend ? `([...document.querySelectorAll('fieldset')].filter(f=>f.querySelector(':scope > legend')?.innerText.trim()===${js(scope.legend)})[${scope.nth ?? 0}])`
    : scope.summary ? `([...document.querySelectorAll('details')].find(d=>d.querySelector(':scope > summary')?.innerText.trim().startsWith(${js(scope.summary)})))`
    : `document.querySelector(${js(scope)})`;
  const api = {
    async open(summary) { await b.eval(`(()=>{const d=${scopeExpr({ summary })}; if(!d) throw new Error('no details ${summary}'); d.open=true;})()`); await sleep(150); },
    async click(scope, text, nth = 0) {
      const ok = await b.eval(`(()=>{const s=${scopeExpr(scope)}; if(!s) return 'no scope'; const bs=[...s.querySelectorAll('button')].filter(x=>x.innerText.replace(/\\s+/g,' ').trim()===${js(text)} && !x.disabled); const e=bs[${nth}]; if(!e) return 'no button: '+[...s.querySelectorAll('button')].map(x=>x.innerText.trim()).slice(0,30).join('|'); e.scrollIntoView({block:'center'}); e.click(); return true;})()`);
      if (ok !== true) throw new Error(`click "${text}": ${ok}`);
      await sleep(150);
    },
    // Set the control a visible <label> names. Labels are matched exactly; nth picks among repeats.
    async set(scope, label, value, nth = 0) {
      const ok = await b.eval(`(()=>{const s=${scopeExpr(scope)}; if(!s) return 'no scope';
        const ls=[...s.querySelectorAll('label')].filter(l=>l.innerText.trim()===${js(label)});
        const l=ls[${nth}]; if(!l) return 'no label: '+[...s.querySelectorAll('label')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,40).join('|');
        const el = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,select,textarea');
        if(!el) return 'no control';
        if (el.type==='checkbox') { if (el.checked !== ${js(Boolean(value))}) el.click(); return true; }
        let v=${js(value)};
        if (el.tagName==='SELECT') { const o=[...el.options].find(o=>o.value===v||o.text.trim()===v); if(!o) return 'no option '+v+' in '+[...el.options].map(o=>o.text).join(','); v=o.value; }
        const proto = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(el, String(v));
        el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
      if (ok !== true) throw new Error(`set "${label}": ${ok}`);
      await sleep(120);
    },
    labels: (scope) => b.eval(`[...(${scopeExpr(scope)}||document).querySelectorAll('label, legend, button')].map(x=>x.tagName[0]+':'+x.innerText.trim().replace(/\\s+/g,' ')).filter(x=>x.length>2).slice(0,80)`),
  };
  return api;
}
