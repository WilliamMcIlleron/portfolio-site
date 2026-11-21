/* ==========================================================================
   booking-cron: a Cloudflare Worker whose only job is to ring the site every
   15 minutes (a Cron Trigger), because Pages Functions cannot run on a schedule.

   It calls POST /api/book/reminders on the site, which sends due reminder
   emails and deletes old bookings. All of the logic lives there, so this Worker
   holds no data and only one secret: REMINDER_SECRET, which must match the
   REMINDER_SECRET on the Pages project.

   Deploy notes: workers/booking-cron/README.md. Not part of the website.
   ========================================================================== */

const TARGET = 'https://williammcilleron.com/api/book/reminders';

async function run(env) {
    const res = await fetch(env.TARGET || TARGET, { method: 'POST', headers: { 'x-reminder-secret': env.REMINDER_SECRET || '' } });
    if (!res.ok) {
        console.error('booking-cron: site answered ' + res.status);
        return;
    }
    console.log('booking-cron: ' + (await res.text()).slice(0, 200)); // counts only: {"ok":true,"sent":0,...}
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(run(env));
    },
    // Not a website: anyone who finds the workers.dev address gets nothing.
    async fetch() {
        return new Response('Not found', { status: 404 });
    },
};
