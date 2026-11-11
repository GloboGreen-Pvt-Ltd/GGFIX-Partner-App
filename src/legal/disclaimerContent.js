// NearGFix Disclaimer Policy (revised from "DISCLAIMER AGREEMENT" docx, 19
// sections), rendered by /disclaimer and the apps' Disclaimer screen.
// Same file as GGFIX-App and GGFIX-Partner-App src/legal/disclaimerContent.js —
// keep all three identical. Informational only: it is NOT part of
// CURRENT_LEGAL_VERSIONS, so publishing it never triggers re-acceptance.

const p = (text) => ({ type: 'p', text });
const lines = (s) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const ul = (s) => ({ type: 'ul', items: lines(s) });
const sec = (num, title, ...blocks) => ({ id: `s${num}`, num, title, blocks });

export const DISCLAIMER_DOC_TYPE = 'DISCLAIMER';

export const DISCLAIMER = {
  type: DISCLAIMER_DOC_TYPE,
  version: 'draft',
  screenTitle: 'Disclaimer',
  heading: 'Disclaimer Policy',
  effectiveDate: '01 October 2026',
  lastUpdated: '01 October 2026',
  intro: [
    p(`This Disclaimer Policy ("Policy") governs the use of the NearGFix website (https://neargfix.com), the NearGFix Customer App, Partner App and Employee App, the Used Device Marketplace, repair and service-booking, pickup and delivery facilities, and related services (collectively, the "Platform"), operated by **Globogreen System & Technology Private Limited**, trading under the brand name **NearGFix** ("Company", "NearGFix", "we", "us" or "our").`),
    p(`**Registered Office:** No. 1/16, South Street, Villiyanallur, Bhuvanagiri Taluk, Tamil Nadu, India
**Website:** https://neargfix.com`),
    p(`NearGFix connects customers ("Customers") with independent repair shops, technicians, electronics shops and other service providers ("Service Providers"). Service Providers and their staff use the Partner App and Employee App to manage bookings, diagnosis, repairs, invoices and deliveries. Unless expressly stated otherwise, NearGFix does not itself perform or directly control the services provided by Service Providers and is not responsible for their acts, omissions or service outcomes, except as required by applicable law.`),
    p(`By accessing or using the Platform, booking a service, or engaging in any transaction through NearGFix, you acknowledge that you have read and understood this Policy. This Policy must be read together with the NearGFix Terms and Conditions, the Privacy Policy and any other applicable policies. Nothing in this Policy limits any right or remedy available to a Customer under the Consumer Protection Act, 2019, the rules made under it, or any other law that cannot be excluded by contract.`),
    p(`If you do not agree with this Policy, please discontinue use of the Platform.`),
  ],
  sections: [
    sec('1', 'Nature and Role of NearGFix',
      p(`NearGFix provides a digital platform to facilitate discovery, comparison, communication, booking, coordination and related interactions between Customers and participating Service Providers.`),
      p(`NearGFix does not own the repair shops listed on the Platform and does not itself perform repair work merely by listing a Service Provider or facilitating a booking.`),
      p(`Unless expressly agreed otherwise in a separate agreement, NearGFix does not:`),
      ul(`own or operate the independent repair shops listed on the Platform;
        directly perform diagnosis, repair, maintenance or replacement of Device components;
        employ or directly supervise the technicians of independent Service Providers, including staff who use the Employee App;
        determine the technical repair method or final repair price for an individual repair performed by a Service Provider;
        manufacture or independently guarantee replacement parts supplied or installed by a Service Provider; or
        act as a Device manufacturer or manufacturer-authorised repair centre merely because a Service Provider is listed on the Platform.`),
      p(`NearGFix may facilitate appointment scheduling, communications, display of information, payments, complaint handling and other functions made available through the Platform.`),
      p(`The role of NearGFix shall be determined by its actual activities and applicable law. Nothing in this Policy removes any legal responsibility arising from NearGFix's own conduct, contractual commitments, representations or statutory obligations.`),
    ),
    sec('2', 'Service Provider Information and Verification',
      p(`The Platform may display information concerning Service Providers, including:`),
      ul(`business name, address, contact details and business hours;
        business history, location, employee and technician information, and photographs;
        repair categories, services offered, indicative prices and available appointment slots;
        ratings, reviews and other Customer feedback;
        pickup and delivery availability; and
        service warranty information, parts information and other relevant business details.`),
      p(`Such information may be provided by Service Providers or obtained from Customers, public sources or other lawful sources.`),
      p(`NearGFix verifies Service Provider information in accordance with its verification procedures, which may include checks of business records, identity or registration documents, contact details and other supporting information, as appropriate. The scope and frequency of verification may vary by type of information. Verification does not guarantee that all information remains complete, accurate, authentic or up to date at all times.`),
      p(`Each Service Provider is responsible for the accuracy, completeness, legality and timely updating of the information it provides through the Partner App or otherwise, and shall promptly notify NearGFix of any material change.`),
      p(`To the extent permitted by applicable law, NearGFix shall not be liable solely for inaccurate, incomplete or outdated information supplied by an independent Service Provider. This exclusion does not apply to liability arising from NearGFix's own acts or omissions, misrepresentation, breach of statutory or contractual obligations, or any liability that cannot lawfully be excluded or limited.`),
      p(`Customers are advised to verify material information, including service prices, replacement-part specifications, appointment availability and warranty conditions, with the relevant Service Provider before authorising a repair or completing a transaction. Nothing in this section limits any mandatory right or remedy available to Customers under applicable law.`),
    ),
    sec('3', 'Repair and Diagnostic Risks',
      p(`Devices contain delicate electronic components, batteries, displays, connectors, sensors, seals and other parts that may be affected during diagnosis, dismantling, repair, reassembly or testing.`),
      p(`Depending on the Device, its condition, the fault and the repair procedure, diagnosis or repair may involve risks including:`),
      ul(`further damage to a component or the Device;
        discovery or worsening of pre-existing or hidden damage;
        failure of the Device or a component to operate after diagnosis or repair;
        changes in display performance, touch sensitivity, sound, connectivity, charging, camera operation, biometric functions or other features;
        reduced water resistance or loss of waterproofing;
        impairment of an existing manufacturer warranty or service entitlement; and
        additional repair requirements or charges following discovery of previously unknown faults.`),
      p(`These risks do not arise in every repair. Their likelihood and consequences depend on the Device, its condition, the fault, the parts used and the work undertaken.`),
      p(`Where further work or additional charges are proposed after diagnosis, the Customer should receive a revised estimate through the Platform or from the Service Provider and approve the additional work before it is performed, where required by law or the agreed service terms.`),
      p(`This Policy does not authorise a Service Provider to undertake unapproved additional work or impose undisclosed charges where approval or disclosure is legally required.`),
    ),
    sec('4', 'Device Data and Data Loss',
      p(`Customers should create and verify a backup of important information before handing over a Device for diagnosis, repair, maintenance or other technical service. This may include photographs, videos, contacts, messages, documents, application data, files and other personal or business content.`),
      p(`Depending on the repair, software troubleshooting, resetting, firmware updates, operating-system changes, component replacement or other technical procedures may cause data deletion, corruption, alteration or loss.`),
      p(`Where appropriate and reasonably practicable, Customers should remove SIM cards, memory cards, removable storage, payment cards, personal belongings and other items not required for the repair.`),
      p(`Customers should not disclose passwords, one-time passwords (OTPs), banking credentials or other sensitive authentication information unless strictly necessary for an agreed technical procedure and through an appropriate secure process. Platform OTPs used to confirm pickup, delivery or account login must be shared only as the Platform instructs.`),
      p(`The Service Provider shall implement appropriate safeguards for the Device and for any Customer information accessed during repair, in accordance with applicable law and its contractual obligations.`),
      p(`To the extent permitted by law, NearGFix shall not be responsible solely for data loss caused by a Device's pre-existing condition, a properly disclosed and necessary repair procedure, or the independent acts or omissions of a Service Provider for which NearGFix is not legally responsible.`),
      p(`Nothing in this section excludes liability for unlawful processing, unauthorised disclosure, negligence, breach of applicable data-protection obligations (including under the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023, as and when applicable), or other liability that cannot lawfully be excluded.`),
      p(`NearGFix's processing of personal data through the Platform is governed by its Privacy Policy and applicable data-protection law. This Policy does not constitute blanket consent to access or use personal data.`),
    ),
    sec('5', 'Pre-existing Damage and Device Condition',
      p(`The Service Provider should inspect the Device before repair, to the extent reasonably practicable, and record its visible condition, reported faults, existing damage, accessories received and relevant identifying details (such as IMEI or serial number).`),
      p(`Customers should disclose known damage, previous repairs, liquid exposure, battery swelling, intermittent faults, software modifications and other conditions that may affect the repair.`),
      p(`Internal damage may not be discoverable until the Device is opened or diagnostic testing is performed. Such damage may affect the feasibility, cost, duration or outcome of the repair.`),
      p(`Subject to applicable law, a Service Provider may not be responsible for damage or malfunction demonstrably attributable to a pre-existing defect or condition that it did not cause or aggravate.`),
      p(`Pre-existing damage does not automatically excuse responsibility for additional damage caused by negligence, improper handling, defective workmanship or breach of an applicable obligation.`),
      p(`Customers should retain inspection reports, photographs, estimates, job sheets, invoices and handover acknowledgements supplied in connection with the repair, including those available in the Customer App.`),
    ),
    sec('6', 'Replacement Parts and Components',
      p(`Depending on the Device, availability, cost and Service Provider, replacement components may include:`),
      ul(`original manufacturer parts;
        original equipment manufacturer (OEM) parts, where accurately described;
        manufacturer-authorised parts;
        compatible or third-party parts;
        refurbished parts; or
        used parts.`),
      p(`NearGFix does not guarantee that every replacement component available through the Platform is original, OEM, manufacturer-authorised, new or refurbished.`),
      p(`Before repair, the Customer should be informed of the type and condition of the proposed replacement part, where relevant, and of any applicable warranty, compatibility limitation or known functional difference.`),
      p(`A Service Provider must not misrepresent a compatible, refurbished or used component as a new original manufacturer component.`),
      p(`Customers should confirm the part type and price before authorising installation. Material changes to the proposed component must be disclosed and approved as required by applicable law and the agreed service terms.`),
      p(`The relevant Service Provider is responsible for receiving, processing and resolving claims under a replacement-part warranty issued by it or applicable to parts supplied or installed by it, subject to the warranty terms and applicable law. Where a manufacturer or other third party issues the warranty, responsibility is determined by that warranty and applicable law.`),
      p(`Unless expressly stated in a separate written agreement, NearGFix does not manufacture, supply or guarantee replacement parts installed by a Service Provider.`),
    ),
    sec('7', 'Repair Estimates, Pricing, Payments and Refunds',
      p(`Prices displayed on the Platform may be indicative estimates, starting prices, standard service prices or confirmed final prices, depending on the listing.`),
      p(`Unless expressly identified as a confirmed final price, a displayed price is not a guaranteed final quotation.`),
      p(`The final repair price may depend on the diagnosis, Device model, fault, replacement components, labour, complexity, parts availability and other disclosed factors.`),
      p(`The Service Provider is responsible for determining and communicating the final repair price and for issuing applicable quotations, invoices and receipts.`),
      p(`Additional charges may apply for diagnosis, parts, labour, taxes, pickup, delivery, urgent service or other items, where applicable and properly disclosed before the Customer is bound to pay them.`),
      p(`Customers should review the final quotation and confirm the total amount payable before authorising repair.`),
      p(`Where payments are collected through the Platform, they may be processed by third-party payment gateways under their own terms. Advance payments, cancellations and refunds are handled in accordance with the Terms and Conditions, the terms shown at the time of booking, and applicable law. Approved refunds are made to the original payment method or as otherwise agreed, within the timelines communicated to the Customer.`),
      p(`NearGFix shall not be responsible solely for a pricing error originating from a Service Provider, provided that NearGFix has not itself made a misleading representation, collected an unauthorised amount or breached an applicable legal obligation.`),
      p(`Nothing in this Policy authorises hidden charges, drip pricing, misleading price displays or collection of amounts contrary to applicable consumer-protection law.`),
    ),
    sec('8', 'Bookings, Appointments and Availability',
      p(`A booking request or appointment slot may be subject to confirmation by the relevant Service Provider. The Platform should indicate whether a booking is pending, accepted, confirmed, rejected or cancelled, as applicable.`),
      p(`A Service Provider may decline, reschedule or cancel a booking where reasonably necessary, subject to applicable law and the disclosed cancellation terms.`),
      p(`Appointment times and completion estimates may change due to repair complexity, parts availability, operational conditions, transport conditions or other relevant circumstances.`),
      p(`NearGFix will use reasonable efforts to keep its booking system functional but does not guarantee that every booking request will be accepted or that every appointment will take place at the originally requested time.`),
      p(`To the extent permitted by law, NearGFix shall not be responsible for delays caused solely by independent Service Providers, traffic, weather, power or network failures, third-party systems or other circumstances beyond its reasonable control.`),
      p(`This section does not excuse NearGFix from an express contractual commitment or any liability that cannot lawfully be excluded.`),
    ),
    sec('9', 'Device Pickup, Delivery and Transportation',
      p(`Where pickup or delivery is offered, it may be performed by the relevant Service Provider, its staff, or an independent logistics or transport provider.`),
      p(`The booking confirmation or service terms should identify, where reasonably practicable, the party responsible for collecting and delivering the Device and the arrangements governing custody and handover.`),
      p(`Customers should ensure that the Device is properly identified and handed over against an appropriate acknowledgement or other verifiable record, such as an OTP confirmation or handover record in the app.`),
      p(`Pickup and delivery may be delayed by traffic, weather, operational problems, access restrictions, transport disruption or other circumstances.`),
      p(`Devices may be exposed to risks of loss, theft, mishandling or damage during transportation. No representation is made that transportation is entirely risk-free.`),
      p(`The Service Provider or logistics provider responsible for the relevant stage of transportation shall be accountable for loss or damage to the extent required by applicable law and the applicable contractual arrangements.`),
      p(`NearGFix is not deemed to have taken custody of a Device merely by facilitating a pickup or delivery booking. Where NearGFix itself takes custody, undertakes transportation or expressly assumes responsibility, this section does not exclude its resulting legal obligations.`),
      p(`To the extent permitted by law, NearGFix shall not be responsible for transportation loss, damage or delay caused solely by an independent logistics provider outside NearGFix's reasonable control, except where NearGFix is legally responsible for the loss.`),
    ),
    sec('10', 'Loss of or Damage to Devices',
      p(`Subject to applicable law, a Service Provider is responsible for a Device while it is in the Service Provider's custody or control, and for loss or damage caused by its breach of duty, negligence, improper handling or other actionable conduct.`),
      p(`Responsibility for loss or damage during pickup and delivery is determined by the custody arrangements, applicable service terms, conduct of the parties and applicable law.`),
      p(`NearGFix does not provide Device insurance or an automatic compensation scheme unless expressly stated in a separate written policy.`),
      p(`The absence of insurance or a NearGFix compensation scheme does not release a Service Provider or other responsible party from liability under applicable law or an enforceable agreement.`),
      p(`Customers should promptly report suspected loss, theft or damage through the support or grievance channel listed in Section 19 and provide available evidence, including photographs, job sheets, handover records and communications.`),
      p(`Each claim will be assessed on its facts, applicable law and the relevant party's contractual and legal responsibilities. Nothing in this Policy creates a blanket exclusion of liability for a lost or damaged Device.`),
    ),
    sec('11', 'Service Warranties',
      p(`Any repair warranty is provided by the relevant Service Provider unless NearGFix expressly states in writing that it is providing a specific warranty.`),
      p(`The existence, duration, scope and conditions of a repair warranty may differ between Service Providers, Device models, repair types and replacement components.`),
      p(`Before proceeding, Customers should review the applicable warranty terms, including the warranty provider, coverage period, claim procedure, available remedies and exclusions.`),
      p(`Depending on the warranty, exclusions may include:`),
      ul(`physical damage occurring after the repair;
        liquid damage or moisture exposure;
        accidental damage;
        unauthorised repair or tampering after service;
        unauthorised software modification;
        normal wear and tear;
        faults unrelated to the repair performed; or
        other exclusions expressly disclosed in the applicable warranty.`),
      p(`An exclusion applies only to the extent stated in the relevant warranty and permitted by law. It does not automatically excuse defective workmanship, failure to honour an applicable warranty, or liability that cannot lawfully be excluded.`),
      p(`NearGFix facilitates access to Service Providers and their warranty information but does not guarantee a Service Provider's warranty or future performance unless NearGFix has expressly undertaken such an obligation in writing.`),
      p(`Nothing in this section removes a separate warranty or undertaking expressly issued by NearGFix or any statutory right available to a Customer.`),
    ),
    sec('12', 'Ratings and Reviews',
      p(`The Platform may display ratings, reviews, photographs and other feedback submitted by Customers or other users.`),
      p(`Reviews represent the views of their authors and do not necessarily represent the views of NearGFix.`),
      p(`NearGFix does not independently verify every review and does not guarantee that every review is accurate, complete, genuine or representative of all Customer experiences.`),
      p(`NearGFix may moderate, remove, restrict or investigate reviews in accordance with its policies, applicable law and applicable intermediary obligations.`),
      p(`NearGFix will not knowingly present a review as verified where it has not been verified, or use reviews in a misleading manner contrary to applicable law.`),
      p(`Users must not submit fraudulent, defamatory, abusive, unlawful or knowingly misleading reviews or content.`),
      p(`Ratings and reviews are one source of information and should not replace a Customer's own assessment of the Service Provider and its disclosed terms.`),
    ),
    sec('13', 'Used Device Marketplace (Buy and Sell)',
      p(`**Marketplace services.** NearGFix may facilitate, through the Platform, the listing, valuation, bidding, making of offers, negotiation, and purchase or sale of used mobile phones, tablets, laptops and other eligible electronic devices ("Used Devices") between Customers and participating Service Providers.`),
      p(`**Role of NearGFix.** NearGFix operates the Used Device Marketplace as a technology platform for facilitating transactions between Customers and participating Service Providers. Unless expressly agreed otherwise in a separate written agreement, NearGFix does not purchase, own, sell or take title to any Used Device merely by listing, displaying, valuing or facilitating a transaction involving it. The purchase or sale contract is between the relevant Customer and Service Provider, subject to the applicable transaction terms and law. NearGFix's role does not relieve it of any obligation or liability imposed on it by applicable law.`),
      p(`**Listings, valuations and offers.** The Platform may display or process information relating to a Used Device, including its make, model, IMEI or serial number, photographs, condition, ownership details, estimated value, offers, bids, proposed purchase price and transaction status. Unless expressly identified as a binding offer or confirmed price, any valuation, indicative price or estimate is informational and does not guarantee the final price. The final price may depend on physical inspection, verification of ownership, functional testing, condition, completeness, authenticity and other material factors disclosed to the Customer. The transacting parties shall confirm the final price and material terms before completing the transaction, and any material change to an agreed price must be communicated and accepted as required by applicable law.`),
      p(`**Customer information and transaction records.** NearGFix may collect, use, disclose and retain relevant personal and transaction information, including identity and contact details, Device details, IMEI or serial number, ownership and condition information, photographs, listings, valuations, bids, offers, transaction records, payment information and related communications. This information is processed only for lawful and disclosed purposes, including transaction facilitation, verification, customer support, fraud prevention, dispute resolution, record-keeping and legal or regulatory compliance, in accordance with the Privacy Policy and applicable data-protection law, and is not collected or retained beyond what is reasonably necessary or otherwise lawfully justified.`),
      p(`**Ownership, authenticity and eligibility.** A Customer offering a Used Device for sale must lawfully own it or have valid authority to sell it, and must provide accurate information about its ownership, condition, authenticity, repair history and any known material defect or restriction. A Customer must not list, offer, sell or attempt to transfer a Device that is stolen, unlawfully obtained, counterfeit, fraudulently represented or otherwise prohibited from sale or transfer under applicable law. NearGFix may request reasonable evidence of identity, ownership or purchase where necessary for verification, fraud prevention or legal compliance, and may reject, suspend, restrict or remove a listing, bid, offer or transaction where it reasonably suspects fraud, unlawful activity, misrepresentation or a breach of Platform policy. Where legally required or permitted, NearGFix may preserve relevant records and disclose information to competent authorities. Nothing in this paragraph authorises NearGFix to confiscate a Device or conclusively determine legal ownership where that determination falls within the jurisdiction of a competent authority.`),
      p(`**Removal of personal data before handover.** A Customer selling a Used Device is responsible for taking reasonable steps, before handover, to back up any required information and remove personal data, accounts, SIM cards, memory cards, activation locks, device-tracking associations and other personal content, where reasonably practicable. The Customer should sign out of personal accounts, disable account-linked security locks where appropriate, and perform a factory reset after preserving any required data. NearGFix does not ordinarily access or retain personal content stored on a Used Device merely because it is listed or sold through the Platform; any such access must be authorised, reasonably necessary for a legitimate purpose, or otherwise permitted or required by law. The Customer should not disclose passwords, OTPs, banking credentials or other sensitive authentication information as part of an ordinary sale.`),
      p(`**Inspection, acceptance and transfer of custody.** Where a Used Device is inspected, collected, delivered or handed over through the Platform, the parties should keep appropriate records of its condition, identifying details, accessories, agreed price and transfer of custody, and should confirm the final price, payment arrangements, inspection findings and any agreed conditions of sale. Responsibility for the Device during collection, inspection, storage, transportation and delivery is determined by the actual custody arrangements, applicable transaction terms, conduct of the parties and applicable law. NearGFix is not deemed to have taken custody of a Used Device merely by facilitating a listing or transaction, but this does not exclude responsibility where NearGFix actually takes custody or expressly assumes a relevant obligation.`),
      p(`**Payment, cancellation and completion.** Payment methods, payment timing, cancellation rights, refunds and completion requirements are communicated through the applicable transaction terms or booking confirmation. Where NearGFix facilitates payments or refunds, it will perform its applicable contractual and legal obligations relating to those processes. No provision of this Policy permits the retention of money, refusal of a refund or cancellation of a transaction where that would violate applicable law or an enforceable contractual obligation.`),
      p(`**Record retention.** NearGFix may retain marketplace listings, transaction records, relevant communications, verification records and related information for as long as reasonably necessary to provide its services, prevent fraud, resolve disputes, comply with legal or regulatory requirements, establish or defend legal claims, or maintain lawful business records. Retention and deletion are governed by the Privacy Policy, applicable retention requirements and applicable data-protection law.`),
      p(`**No Customer-to-Customer transactions.** The Marketplace does not permit direct Customer-to-Customer buying or selling of Used Devices through the Platform. Every transaction must involve a participating Service Provider as the relevant transacting party. NearGFix may restrict or remove listings, offers or transactions that attempt to circumvent this requirement, subject to applicable law.`),
      p(`**Condition of Used Devices.** Unless NearGFix expressly provides a separate written warranty or guarantee, NearGFix does not independently guarantee the condition, authenticity, performance, ownership or future reliability of a Used Device offered by a participating Service Provider. The relevant seller remains responsible for the representations and contractual obligations applicable to the sale, subject to applicable law. Nothing in this paragraph excludes liability for misleading representations, unlawful conduct or other liability that cannot lawfully be excluded.`),
    ),
    sec('14', 'No Manufacturer Affiliation or Endorsement',
      p(`Unless expressly disclosed otherwise, NearGFix is not affiliated with, sponsored by, endorsed by or authorised by any mobile phone or electronic Device manufacturer.`),
      p(`The listing of a Service Provider on the Platform does not mean that the Service Provider is authorised by a Device manufacturer, is an official service centre, or has been endorsed by that manufacturer.`),
      p(`Any claim of manufacturer authorisation or certification must be supported by a valid and current authorisation and must not be inferred merely from the Service Provider's presence on the Platform.`),
      p(`Brand names, logos, model names and other trademarks may be used where reasonably necessary to identify compatible Devices or services. Such use does not imply affiliation or endorsement, and all trademarks belong to their respective owners.`),
      p(`Customers should independently confirm any manufacturer-authorisation claim where that status is material to their decision.`),
    ),
    sec('15', 'Third-Party Services and External Systems',
      p(`The Platform may rely on or integrate third-party services, including mapping, messaging (such as SMS and WhatsApp), push notifications, logistics, cloud hosting, analytics, communication systems and payment infrastructure.`),
      p(`Such services may be governed by their own terms, availability conditions and privacy practices.`),
      p(`NearGFix does not control every operational, security, privacy or availability aspect of an independent third-party service and, to the extent permitted by law, disclaims responsibility for failures attributable solely to such third parties and outside NearGFix's reasonable control.`),
      p(`This exclusion does not apply where NearGFix has independently undertaken a relevant obligation, failed to comply with a legal duty, or is otherwise responsible under applicable law.`),
      p(`Where third-party links or services are made available, users should review the relevant third party's terms and privacy notices before using them.`),
    ),
    sec('16', 'Platform Availability and Technical Interruptions',
      p(`NearGFix will use reasonable efforts to keep the website and apps, including their booking and marketplace features, functional and secure.`),
      p(`The Platform may occasionally be unavailable or experience delays, errors, maintenance interruptions or restricted functionality due to:`),
      ul(`scheduled maintenance or technical upgrades;
        internet or mobile network failure;
        hosting, cloud or infrastructure failure;
        payment gateway or communication provider failure;
        cybersecurity incidents or attempted attacks;
        power outages;
        third-party system outages; or
        legal, regulatory or security requirements.`),
      p(`NearGFix may temporarily suspend, restrict or modify Platform features where reasonably necessary for maintenance, security, compliance, fraud prevention or operational reasons.`),
      p(`NearGFix does not guarantee uninterrupted or error-free availability at all times. Where reasonably practicable, it may give advance notice of planned interruptions that materially affect users.`),
      p(`To the extent permitted by law, NearGFix shall not be responsible for losses arising solely from interruptions beyond its reasonable control. This does not excuse a failure to perform an express obligation or any liability that cannot lawfully be excluded.`),
      p(`Users should retain booking confirmations and verify important appointments or transactions where the Platform shows an error or uncertainty.`),
    ),
    sec('17', 'Cybersecurity and Account Security',
      p(`NearGFix will take reasonable security measures appropriate to the nature of the Platform and the information it processes.`),
      p(`No online system, electronic communication channel or storage environment can be guaranteed to be completely secure against every possible threat.`),
      p(`Customers, Service Providers and their staff are responsible for keeping their account credentials and OTPs confidential, using appropriate device security, and promptly notifying NearGFix of suspected unauthorised access. Service Providers are responsible for the actions of staff they add to the Partner App or Employee App and for removing access when it is no longer required.`),
      p(`To the extent permitted by law, NearGFix shall not be responsible for unauthorised access caused solely by circumstances beyond its reasonable control despite appropriate safeguards. This exclusion does not apply where the incident results from NearGFix's own breach of a legal obligation, failure to implement legally required safeguards, negligence or other actionable conduct.`),
      p(`NearGFix will handle security incidents and personal data in accordance with applicable law and its published policies.`),
    ),
    sec('18', 'Force Majeure',
      p(`NearGFix shall not be responsible for a delay or failure to perform an obligation to the extent directly caused by an event beyond its reasonable control that could not reasonably have been avoided or overcome through appropriate measures.`),
      p(`Such events may include natural disasters, floods, fires, epidemics or pandemics, government restrictions, war, civil unrest, strikes, power failures, widespread network disruptions, transport interruptions, cyber incidents and third-party service outages.`),
      p(`NearGFix will take reasonable steps, where practicable, to mitigate the effects of such events and resume affected services.`),
      p(`This section does not excuse payment, refund, data-protection or other obligations to the extent that applicable law requires their performance notwithstanding the event.`),
    ),
    sec('19', 'Contact Information',
      p(`For customer support, complaints and Platform-related enquiries:`),
      p(`**Globogreen System & Technology Private Limited**
**Brand:** NearGFix
**Website:** https://neargfix.com
**Registered Office:** No. 1/16, South Street, Villiyanallur, Bhuvanagiri Taluk, Tamil Nadu, India`),
      p(`**Email:** support@neargfix.com
**Phone:** +91 8124123452`),
      p(`**Acceptance.** By accessing or using the Platform, registering an account, making a booking, providing or receiving any service, or otherwise using NearGFix, Customers and Service Providers confirm that they have read and understood this Policy together with the Terms and Conditions and the Privacy Policy.`),
    ),
  ],
};
