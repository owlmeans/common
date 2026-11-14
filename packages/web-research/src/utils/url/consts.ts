/** Query parameters that only track a visit — dropped, so two links to one page are one candidate. */
export const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|igshid)$/i
