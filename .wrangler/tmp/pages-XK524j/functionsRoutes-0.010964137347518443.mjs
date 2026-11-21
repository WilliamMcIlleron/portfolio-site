import { onRequestGet as __api_check__id__js_onRequestGet } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\check\\[id].js"
import { onRequest as __api_check__id__js_onRequest } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\check\\[id].js"
import { onRequestPost as __api_audit_js_onRequestPost } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\audit.js"
import { onRequestPost as __api_audit_lead_js_onRequestPost } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\audit-lead.js"
import { onRequestPost as __api_contact_js_onRequestPost } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\contact.js"
import { onRequest as __api_audit_js_onRequest } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\audit.js"
import { onRequest as __api_audit_lead_js_onRequest } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\audit-lead.js"
import { onRequest as __api_contact_js_onRequest } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\api\\contact.js"
import { onRequestGet as __check__id__js_onRequestGet } from "C:\\Users\\weebm\\OneDrive\\Desktop\\Projects\\portfolio-site\\.claude\\worktrees\\fix-check-pause\\functions\\check\\[id].js"

export const routes = [
    {
      routePath: "/api/check/:id",
      mountPath: "/api/check",
      method: "GET",
      middlewares: [],
      modules: [__api_check__id__js_onRequestGet],
    },
  {
      routePath: "/api/check/:id",
      mountPath: "/api/check",
      method: "",
      middlewares: [],
      modules: [__api_check__id__js_onRequest],
    },
  {
      routePath: "/api/audit",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_audit_js_onRequestPost],
    },
  {
      routePath: "/api/audit-lead",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_audit_lead_js_onRequestPost],
    },
  {
      routePath: "/api/contact",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_contact_js_onRequestPost],
    },
  {
      routePath: "/api/audit",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_audit_js_onRequest],
    },
  {
      routePath: "/api/audit-lead",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_audit_lead_js_onRequest],
    },
  {
      routePath: "/api/contact",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_contact_js_onRequest],
    },
  {
      routePath: "/check/:id",
      mountPath: "/check",
      method: "GET",
      middlewares: [],
      modules: [__check__id__js_onRequestGet],
    },
  ]