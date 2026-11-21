/**
 * Cloudflare Pages Function: GET /check/{reportId}
 *
 * The shareable report page. Every /check/{id} is the same static page
 * (check/index.html), which reads the report from /api/check/{id}. This
 * replaces a '/check/*  /check/index.html  200' rewrite in _redirects: Pages
 * does not apply that rewrite to its own folder index (it 404ed in
 * production), so the function fetches the asset itself.
 *
 * Anything that is not a 12-character base62 id is a plain 404, so /check/
 * (the static folder index) and random paths behave normally. Never indexed.
 */

const REPORT_ID = /^[A-Za-z0-9]{12}$/;

export async function onRequestGet(context) {
    const id = context.params?.id;
    if (typeof id !== 'string' || !REPORT_ID.test(id)) {
        return new Response('Not found', { status: 404, headers: { 'x-robots-tag': 'noindex' } });
    }
    const assets = context.env?.ASSETS;
    if (!assets || typeof assets.fetch !== 'function') {
        console.error('check page: missing ASSETS binding');
        return new Response('Something broke on my side. Try again in a minute.', { status: 500, headers: { 'x-robots-tag': 'noindex' } });
    }
    let res = await assets.fetch(new URL('/check/', context.request.url));
    // The asset host can answer a folder with a redirect to its own canonical path; follow one hop.
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        res = await assets.fetch(new URL(res.headers.get('location'), context.request.url));
    }
    const headers = new Headers(res.headers);
    if (res.ok && !/text\/html/i.test(headers.get('content-type') || '')) headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('x-robots-tag', 'noindex');
    headers.set('cache-control', 'no-store');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
