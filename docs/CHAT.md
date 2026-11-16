# Chat between students and businesses

- A student taps **Chat** on a shop page. That opens (or reopens) one conversation per student and business (`start_conversation`).
- Text only, up to 1,000 characters a message, 20 messages a minute per person.
- On the business side, **owners and managers** read and reply (owners need two-factor, as for all business management). Cashiers don't see chats.
- The business can **block** a student from writing again, and unblock them. Both are audited.
- New messages arrive live (Supabase Realtime on `public.messages`, filtered by RLS).
- Notifications use the **Messages** category: one per burst (when the other side spoke last, or after 10 quiet minutes). Push is on by default; email is off.
- Call and WhatsApp buttons use the shop's own phone and WhatsApp numbers, from the shop page and the chat header.
- Students see the shop's name; the shop sees the student's name. Phone numbers are never shared through chat.

Code: `supabase/migrations/20261114090027_chat.sql`, `src/features/chat/`, `src/app/student/messages/`, `src/app/merchant/messages/`. Tests: `supabase/tests/024_chat_test.sql`.
