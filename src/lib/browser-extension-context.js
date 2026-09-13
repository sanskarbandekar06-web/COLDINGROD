export function mergeBasisIntoContext(context, basis) {
  if (!context?.selected_lead || !basis?.lead) return context;
  const contacts = basis.contacts ?? [];
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return {
    ...context,
    selected_lead: { ...context.selected_lead, ...basis.lead, contacts, report: basis.report },
    messages: (context.messages ?? []).map((message) => {
      const contact = byId.get(message.contact_id);
      if (!contact) return message;
      return {
        ...message,
        email: contact.email, phone: contact.phone, phone_type: contact.phone_type,
        whatsapp_number: contact.whatsapp_number, whatsapp_status: contact.whatsapp_status,
        whatsapp_source_url: contact.whatsapp_source_url,
        linkedin_url: contact.linkedin_url, instagram_handle: contact.instagram_handle,
        facebook_url: contact.facebook_url,
      };
    }),
  };
}
