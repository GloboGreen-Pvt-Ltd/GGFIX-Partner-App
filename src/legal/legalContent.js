// Verbatim text of the Near G Fix Terms and Conditions and Privacy Policy
// (source PDFs dated 19 July 2026). Do not edit wording here — publish a new
// version instead: bump `version` (ISO date) and users are asked to re-accept.
// `**text**` marks bold spans as they appear in the source documents.

const p = (text) => ({ type: 'p', text });
const h = (text) => ({ type: 'h', text });
const n = (num, text) => ({ type: 'n', num, text });
const lines = (s) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const ul = (s) => ({ type: 'ul', items: lines(s) });
const ol = (s) => ({ type: 'ol', items: lines(s) });
const sec = (num, title, ...blocks) => ({ id: `s${num}`, num, title, blocks });

export const LEGAL_DOC_TYPES = { TERMS: 'TERMS', PRIVACY: 'PRIVACY' };

const TERMS = {
  type: LEGAL_DOC_TYPES.TERMS,
  version: '2026-07-19',
  screenTitle: 'Terms & Conditions',
  heading: 'Terms and Conditions',
  effectiveDate: '19 July 2026',
  lastUpdated: '19 July 2026',
  intro: [
    p(`These Terms and Conditions ("Terms", "Terms of Use" or "Agreement") govern access to and use of the Near G Fix mobile application, website, software, technology platform and related services (collectively, the "Platform").`),
    p(`The Platform is operated by: **Globogreen System and Technology Pvt. Ltd.**
**Trading/Brand Name:** Near G Fix
**Registered Office:** No. 1/16, South Street, Villiyanallur, Bhuvanagiri Taluk, Tamil Nadu, India
**Website:** neargfix.com`),
    p(`In these Terms, the company may be referred to as "**Near G Fix**", "**Company**", "**we**", "**us**" or "**our**".`),
    p(`A person accessing or using the Platform may be referred to as "**Customer**", "**User**", "**you**" or "**your**".`),
    p(`Service providers, repair shops, mobile shops and other businesses listed on the Platform are referred to as "**Service Providers**", "**Shops**", "**Partner Shops**" or "**SPs**".`),
    p(`By registering for an account, accessing the Platform, booking a service, submitting a device, communicating with a Shop through the Platform, purchasing or selling a used device through a Shop, or otherwise using any Near G Fix service, you acknowledge that you have read, understood and agreed to these Terms.`),
    p(`If you do not agree with these Terms, you must not use the Platform.`),
  ],
  sections: [
    sec('1', 'Definitions',
      h(`1.1. "Platform"`),
      p(`"Platform" means the Near G Fix mobile application, Website, technology infrastructure, software, databases, interfaces, communication systems, booking systems and related services operated or made available by the Company.`),
      h(`1.2. "Customer"`),
      p(`"Customer" means an individual who accesses or uses Near G Fix to search for services, book repair services, communicate with a Service Provider, purchase or sell an eligible used device through the applicable marketplace feature, or otherwise use the Platform.`),
      h(`1.3. "Service Provider"`),
      p(`"Service Provider" means an independent third-party repair shop, mobile shop, electronics shop, technician, business or other service provider registered or approved to offer services through Near G Fix.`),
      h(`1.4. "Repair Service"`),
      p(`"Repair Service" means repair, diagnosis, replacement, maintenance, software service, hardware service, data recovery, refurbishment, repainting, accessory-related service or other electronic-device service listed by a Service Provider on the Platform.`),
      h(`1.5. "Device"`),
      p(`"Device" includes smartphones, iPhones, Android devices, tablets, laptops, desktops and other electronic gadgets accepted through the Platform.`),
      h(`1.6. "Used Device Marketplace"`),
      p(`"Used Device Marketplace" means the functionality through which a participating Service Provider may offer to purchase a Customer's used mobile phone, smartphone, tablet, laptop or other eligible electronic gadget, or through which a participating Service Provider may offer an eligible used device for sale to a Customer.`),
      h(`1.7. "Transaction"`),
      p(`"Transaction" means a booking, repair engagement, purchase, sale, payment, refund, used-device purchase or other commercial interaction facilitated through the Platform.`),
    ),
    sec('2', 'Eligibility and Customer Account',
      h(`2.1 Minimum Age`),
      p(`The Platform is available only to persons aged 18 years or above. By registering or using the Platform, you represent that you have the legal capacity to enter into a binding agreement under applicable law.`),
      h(`2.2 Legal Capacity`),
      p(`You must not use the Platform if you are legally prohibited from doing so, are acting without the required authority on behalf of another person, provide false or misleading information, or have previously been suspended or terminated for a material violation of these Terms.`),
      h(`2.3 One Customer Account`),
      p(`Each Customer may maintain only one personal account linked to one individual mobile number, unless otherwise permitted by Near G Fix. Creating multiple or false accounts to circumvent restrictions, verification requirements, suspension, or other Platform controls is prohibited. Near G Fix may suspend or terminate duplicate or unauthorised accounts.`),
      h(`2.4 Customer Information`),
      p(`Near G Fix may collect and process information necessary to provide and administer the Platform, including:`),
      ul(`name, mobile number, email address, and address;
        KYC, identity, and address documents, where required;
        profile or personal photographs;
        location information;
        Device information, including brand, model, IMEI, serial number, condition, accessories, photographs, and videos;
        booking, repair, warranty, transaction, payment, and service history;
        communications, complaints, ratings, and reviews; and
        other information reasonably necessary for Platform services.`),
      h(`2.5 Use of Information`),
      p(`Such information may be used for account creation and verification, providing and facilitating Platform services, connecting Customers with Service Providers, repair and Used Device transactions, payments, customer support, fraud prevention, maintaining records, and complying with applicable law.`),
      p(`The collection and processing of personal information shall be governed by the Near G Fix Privacy Policy and applicable law.`),
      h(`2.6 Accuracy and Account Security`),
      p(`Customers must provide accurate, complete, and current information and must not submit false, forged, or misleading documents. Customers are responsible for maintaining the security of their account, mobile number, OTP, and other authentication credentials and must promptly report unauthorised access or misuse.`),
    ),
    sec('3', 'Nature and Role of Near G Fix',
      h(`3.1 Technology Platform and Marketplace`),
      p(`Near G Fix operates as a technology platform and marketplace that connects Customers with independent Service Providers and facilitates the discovery, listing, communication, booking, and access to repair, maintenance, diagnostic, Used Device transactions, and other Services available through the Platform,`),
      h(`3.2 Independent Service Providers`),
      p(`Service Providers listed on the Platform are independent third-party businesses and are not employees, agents, partners, joint ventures, or representatives of Near G Fix. Except where expressly stated otherwise, the Services are provided solely by the relevant Service Provider.`),
      h(`3.3 Service Provider Listings`),
      p(`Near G Fix may display information relating to Service Providers, including business details, Services offered, pricing, operating hours, ratings, reviews, warranty information, and pickup or delivery availability, where applicable. Such information may be provided or updated by the relevant Service Provider.`),
      h(`3.4 Booking Facility`),
      p(`Where booking functionality is available, Customers may select a Service Provider and submit a booking request through the Platform. Any booking is subject to the availability and acceptance of the relevant Service Provider.`),
      h(`3.5 Pickup and Delivery`),
      p(`Where a Service Provider offers pickup and/or delivery facilities, Near G Fix may display the availability of such facilities on the Platform, where applicable. Near G Fix does not itself provide, arrange, operate, or undertake pickup or delivery services. Such facilities shall be provided solely by the relevant Service Provider or its authorised personnel.`),
      h(`3.6 Service Provider Responsibility`),
      p(`The relevant Service Provider shall remain responsible for the Services provided by it, including, where applicable, diagnosis, pricing, repair, workmanship, parts, warranty, invoicing, Device custody, and pickup or delivery.`),
      h(`3.7 Limited Role of Near G Fix`),
      p(`Near G Fix acts primarily as a technology platform and intermediary for listing, discovery, communication, booking, and related Platform functions. Unless expressly stated otherwise, Near G Fix does not itself provide the underlying repair or other Services and does not become a party to the contract between the Customer and the Service Provider merely by providing the Platform.`),
      h(`3.8 Used Device Marketplace`),
      p(`Where applicable, Near G Fix may facilitate listings, offers, and transactions relating to Used Devices between Customers and participating Service Providers. Unless expressly stated otherwise, Near G Fix does not purchase, own, sell, or take title to such Used Devices.`),
      h(`3.9 No Guarantee`),
      p(`The listing or display of any Service Provider, Service, Used Device, rating, review, or other information on the Platform does not constitute an endorsement, certification, or guarantee by Near G Fix of the Service Provider, Service, Device, price, quality, availability, or performance.`),
    ),
    sec('4', 'Service Provider',
      h(`4.1 Information Displayed About Service Providers`),
      p(`**The Platform may display the following information relating to Service Providers, subject to the information provided and verified:**`),
      ul(`Shop/Business name
        Business address
        Phone number
        Business hours
        Services offered
        Pricing or service charges
        Business and shop photographs
        Customer ratings and reviews
        Technician information (where applicable)
        Warranty information (where applicable)
        Pickup and delivery availability
        Business history/profile
        Pickup/delivery availability
        Number of employees
        Any other information voluntarily provided or approved by Near G Fix.`),
      h(`4.2 Registration and Onboarding`),
      p(`Service Providers may register independently or be invited and onboarded by Near G Fix. Near G Fix may require relevant information and supporting documents for registration, verification, onboarding, and continued participation on the Platform.`),
      h(`4.3 Verification`),
      p(`Near G Fix may verify Service Providers using information and documents including:`),
      ul(`Business registration documents;
        GST/GSTIN and MSME details;
        Premises ownership or rental documents;
        KYC and identity documents;
        Contact details;
        Business or shop photographs;
        Service information, pricing, business history, and number of employees;
        Any other documents reasonably required by Near G Fix.`),
      h(`4.4 Verification Is Not a Guarantee`),
      p(`Verification by Near G Fix does not constitute a guarantee, certification, endorsement, or warranty regarding the Service Provider's quality, performance, financial capacity, legal compliance, or ability to satisfy any Customer`),
      p(`Customers remain responsible for exercising reasonable care when selecting and engaging a Service Provider.`),
      h(`4.5 Suspension or Removal`),
      p(`Subject to applicable law, Near G Fix may suspend, restrict, deactivate, remove, or terminate a Service Provider's account or listing where reasonably necessary due to fraud, safety or security concerns, legal violations, inaccurate information, repeated complaints, non-performance, misuse of the Platform, breach of these Terms, or other material risks to Customers or the Platform.`),
    ),
    sec('5', 'Service Provider Subscription Model',
      h(`5.1 Subscription-Based Model`),
      p(`Near G Fix may offer Service Providers subscription plans from time to time, with subscriptions being offered on an annual basis.`),
      h(`5.2 Subscription Fees`),
      p(`The applicable subscription fee, duration, features, benefits, and other applicable terms for each plan will be **displayed on the Platform at the time of subscription**. Service Providers may select a plan based on their requirements.`),
      h(`5.3 Payment and Renewal`),
      p(`The Service Provider shall pay the applicable subscription fee through the payment method made available by Near G Fix. Any renewal, expiry, upgrade, downgrade, or change in subscription will be governed by the terms and information displayed on the Platform at the relevant time.`),
      h(`5.4 Changes to Subscription Plans`),
      p(`Near G Fix may introduce, modify, suspend, or discontinue any subscription plan or change its applicable fee or features, subject to applicable law. Any applicable changes will be communicated or displayed on the Platform.`),
      h(`5.5 No Customer Subscription`),
      p(`The Service Provider subscription model does **not require Customers to pay a subscription fee** for ordinary use of the Platform. Customers may, however, be required to pay separately disclosed charges relating to services, transactions, diagnosis, payment processing, pickup/delivery, or other applicable services.`),
      h(`5.6 No Ownership Rights`),
      p(`Payment of a subscription fee does not grant the Service Provider any ownership or proprietary rights in Near G Fix's **software, application, trademarks, databases, technology, content, or other intellectual property**.`),
    ),
    sec('6', 'Booking and Appointment',
      h(`6.1 Booking Process`),
      p(`A Customer may make a Booking through the Platform by selecting a specific Service Provider, selecting the required Service, choosing an available Date and Time, and confirming the Booking request.`),
      h(`6.2 Selection of Service Provider`),
      p(`The Customer may select a specific Service Provider for the requested Service, subject to the availability of such Service Provider and the applicable Service terms.`),
      h(`6.3 Selection of Technician`),
      p(`The Customer shall not be entitled to select a specific technician. The Service Provider shall determine and assign the appropriate technician or personnel to perform the Service, based on availability, qualifications, scheduling and operational requirements.`),
      h(`6.4 Booking Confirmation`),
      p(`A Booking shall not be deemed automatically confirmed merely upon submission of a Booking request by the Customer. The Booking shall become confirmed only upon acceptance of the Booking request by the relevant Service Provider through the Platform or otherwise as may be notified by the Platform.`),
      h(`6.5 Rejection of Booking by Service Provider`),
      p(`A Service Provider may reject a Booking request, subject to the applicable Platform policies. Such rejection may be based on the Service Provider's availability, capacity, operational requirements, inability to provide the requested Service, scheduling constraints, or other reasonable circumstances.`),
      h(`6.6 Change of Appointment Time by Service Provider`),
      p(`A Service Provider may request or make changes to the scheduled appointment time, subject to the Customer being notified through the Platform or other registered communication channel. Any such change shall be subject to availability and the applicable operational requirements of the Service Provider.`),
      h(`6.7 Customer Rescheduling`),
      p(`The Customer may request to reschedule a confirmed Booking, subject to the availability of the Service Provider and the applicable rescheduling conditions. Any rescheduling request shall be made within the Service Provider's business operating hours and through the Platform or such other mode as may be permitted.`),
      h(`6.8 Cancellation by Customer`),
      p(`The Customer may cancel a Booking through the Platform, subject to the applicable cancellation terms and the status of the Booking.`),
      h(`6.9 Cancellation Fee`),
      p(`No cancellation fee shall ordinarily be applicable to a Customer's cancellation of a Booking. However, the Platform reserves the right to introduce or modify applicable cancellation charges by providing appropriate notice to Customers, where permitted under the applicable terms.`),
      h(`6.10 No-Show Fee`),
      p(`No separate no-show fee shall be applicable to the Customer unless otherwise expressly notified by the Platform in the applicable Booking terms.`),
    ),
    sec('7', 'Diagnosis and Repair Estimate',
      h(`7.1 Initial Inspection`),
      p(`The Device shall be inspected by the Service Provider and/or the authorised pickup personnel before the commencement of any repair. The initial inspection shall be provided free of charge.`),
      h(`7.2 Device Condition Recording`),
      p(`At the time of handover, the condition of the Device may be recorded through photographs, videos, digital checklists and other appropriate records. The IMEI number/serial number of the Device shall also be recorded, wherever applicable.`),
      h(`7.3 Accessories`),
      p(`Any accessories handed over by the Customer along with the Device shall be recorded in the booking/handover records and may also be captured through photographs or video recording. The Customer shall ensure that all accessories handed over are properly disclosed at the time of pickup/handover.`),
      h(`7.4 Customer Disclosure`),
      p(`The Customer shall disclose all known defects, existing physical damage, liquid exposure, previous repairs, missing components and any other material condition relating to the Device before the repair process commences.`),
      h(`7.5 Diagnosis`),
      p(`Where applicable, the Service Provider may conduct diagnostic testing after the initial inspection to identify the apparent fault or determine the repair requirements. The initial diagnosis/inspection shall be free of charge.`),
      h(`7.6 Initial Repair Estimate`),
      p(`Based on the information and condition of the Device available at the time of the initial inspection and diagnosis, the Service Provider shall provide an initial repair estimate, wherever reasonably possible.`),
      h(`7.7 Final Repair Price`),
      p(`The final repair price may differ from the initial estimate where further inspection or diagnosis identifies additional repair requirements, including but not limited to:`),
      ol(`a. additional defects;
        b. hidden or previously unidentified damage;
        c. additional parts or components required;
        d. additional labour or repair work;
        e. liquid damage;
        f. motherboard or internal component damage;
        g. software-related issues;
        h. previously concealed or undisclosed damage; or
        i. any other circumstances which could not reasonably be identified during the initial inspection or assessment.`),
      h(`7.8 Additional Repair Approval`),
      p(`Where any additional repair work materially changes the estimated repair cost or scope of work, the Service Provider shall obtain the Customer's approval before proceeding with such additional repair work. Such approval may be obtained through the App, WhatsApp, telephone call, SMS, email or any other recorded communication method.`),
      h(`7.9 Refusal of Additional Repair`),
      p(`If the Customer declines or refuses the additional repair work, the Service Provider shall not be required to carry out such additional repair work. In such circumstances, the Customer may be required to pay the applicable diagnosis/inspection fee, together with the applicable pickup and delivery charges, where such charges are disclosed or applicable.`),
      h(`7.10 Return of Device`),
      p(`Where the Customer declines the additional repair and requests the return of the Device, the Device shall be returned in its condition at the time of return, subject to the applicable diagnosis/inspection, pickup and delivery charges. The Customer acknowledges that certain faults or issues may remain unresolved where the Customer declines the recommended additional repair.`),
    ),
    sec('8', 'Repair Parts',
      h(`8.1 Part Selection`),
      p(`Depending on the service, the Service Provider may offer different replacement part options.`),
      h(`8.2 Customer Choice`),
      p(`Where multiple part options are available, the Customer may be permitted to select a preferred part type based on availability and applicable price.`),
      h(`8.3 Disclosure`),
      p(`The Service Provider should communicate material information concerning the applicable replacement part before installation where reasonably practicable.`),
      h(`8.4 Replaced Parts`),
      p(`Replaced parts may be returned to the Customer upon request, subject to:`),
      ul(`safety requirements;
        manufacturer requirements;
        disposal requirements;
        warranty conditions; and
        applicable law.`),
    ),
    sec('9', 'Service Warranty',
      h(`9.1 Warranty Provided by Service Provider`),
      p(`Where a warranty is offered, it is provided by the applicable Service Provider unless expressly stated otherwise.`),
      h(`9.2 Warranty Period`),
      p(`The warranty period may vary according to the service or replacement part and may be, for example:`),
      ul(`3 months;
        6 months; or
        12 months.`),
      p(`The specific warranty period applicable to a Transaction should be communicated to the Customer.`),
      h(`9.3 Warranty Scope`),
      p(`Warranty generally applies only to defects covered by the applicable Service Provider's stated warranty conditions.`),
      h(`9.4 Exclusions`),
      p(`Unless otherwise expressly stated, warranty may not cover:`),
      ul(`physical damage;
        accidental damage;
        liquid/water damage;
        unauthorised repair;
        software modification;
        misuse;
        normal wear and tear;
        subsequent damage;
        tampering; or
        damage caused after delivery of the repaired Device.`),
      h(`9.5 Warranty Claims`),
      p(`Warranty claims should initially be directed to the Service Provider.
Near G Fix may assist with communication or escalation but does not automatically become the warranty provider.`),
    ),
    sec('10', 'Pickup and Delivery',
      h(`10.1 Pickup and Delivery Facility`),
      p(`Where an independent Service Provider offers pickup and/or delivery of Devices, Near G Fix may display the availability of such facility on the Platform, where applicable.`),
      h(`10.2 Charges`),
      p(`Pickup and/or delivery may be provided by the Service Provider either free of charge or for a separate charge, as applicable. Any applicable charges shall be communicated to the Customer by the Service Provider before the pickup or delivery is undertaken.`),
      h(`10.3 Service Provider Responsibility`),
      p(`Near G Fix does not itself provide, arrange, operate, or undertake pickup or delivery services. Any pickup or delivery shall be provided solely by the relevant Service Provider or its authorised personnel, who shall be responsible for the Device while it is in their custody or control.`),
      h(`10.4 Pickup Record`),
      p(`Photographs, OTP verification, digital acknowledgements, IMEI/serial number records, videos and other relevant records may be used during pickup to record the Device, its condition and the details of the handover.`),
      h(`10.5 Customer Availability`),
      p(`The Customer shall ensure that the Device is available at the agreed time and location for pickup or delivery. If the Customer is unavailable or unable to receive or hand over the Device at the scheduled time, the pickup or delivery may be rescheduled to another mutually agreed time.`),
      h(`10.6 Transit Responsibility`),
      p(`Once the Device has been handed over to and accepted by the Service Provider or its authorised personnel for pickup, transportation or delivery, the Service Provider shall be responsible for the safe custody of the Device during such period.`),
      h(`10.7 Loss or Damage During Transit`),
      p(`If the Device is lost, misplaced, damaged or otherwise adversely affected while it is in the custody of the Service Provider or its authorised personnel during pickup, transportation or delivery, the Service Provider shall bear responsibility for such loss or damage, subject to the condition of the Device recorded at the time of handover and applicable law.`),
    ),
    sec('11', 'Data Protection and Device Data',
      h(`11.1 Customer Data Backup`),
      p(`The Customer is responsible for backing up all data stored on the Device before handing it over for inspection, diagnosis, repair, or servicing. Near G Fix and the Service Provider shall not be responsible for data loss arising from the repair or servicing process, except to the extent required by applicable law.`),
      h(`11.2 Access to Device Data`),
      p(`The Service Provider may access data on the Device only to the extent reasonably necessary for diagnosis, testing, troubleshooting, repair, or verification of the requested Service.`),
      h(`11.3 Password/PIN`),
      p(`The Customer shall not be required, and shall not ordinarily be requested, to disclose or share any primary password, PIN, OTP, banking credential, payment credential, or other sensitive authentication credential. Where, and to the extent, technically necessary for the provision of a Service expressly requested by the Customer, the Customer may be required to provide or use an appropriate password, PIN, passcode, access credential, or other authentication information, provided that such requirement is limited to what is strictly necessary for the provision of such Service and is subject to applicable law and reasonable security measures. Nothing in this Clause shall require the Customer to disclose any credential where such disclosure is prohibited by applicable law, the relevant financial institution, payment service provider, or applicable security requirements.`),
      h(`11.4 Resetting or Formatting`),
      p(`The Service Provider shall not intentionally reset, format, erase, or otherwise delete Customer data without the Customer's approval, except where such action is necessary for the requested Service and is permitted by applicable law.`),
      h(`11.5 Data Protection`),
      p(`**Near G Fix and the relevant Service Provider shall process Customer's personal data in accordance with the Digital Personal Data Protection Act, 2023, the rules and regulations made thereunder, and other applicable data-protection laws, as amended or replaced from time to time.**`),
      h(`11.6 Purpose of Processing`),
      p(`Personal and Device information may be collected and processed for account management, booking and service facilitation, Device identification, diagnosis and repair, transaction processing, customer support, fraud prevention, record-keeping, security, and compliance with applicable law.`),
      h(`11.7 IMEI and Device Information`),
      p(`Near G Fix and/or the Service Provider may collect and record the Device's IMEI, serial number, model, condition, photographs, videos, repair history, and other relevant Device information for identification, service processing, verification, record-keeping, and dispute resolution.`),
      h(`11.8 Sharing of Information`),
      p(`Near G Fix may share relevant Customer and Device information with the applicable Service Provider and other authorised service providers where reasonably necessary to provide the requested Service, process bookings or transactions, communicate with the Customer, or comply with applicable law.`),
      h(`11.9 Security and Limited Access`),
      p(`Reasonable measures shall be taken to protect Customer personal data and restrict access to authorised persons. Access to Device or Customer data shall be limited to what is reasonably necessary for the relevant purpose.`),
      h(`11.10 Privacy Policy`),
      p(`The collection, use, storage, sharing, retention, and other processing of personal data shall be further governed by Near G Fix's Privacy Policy, as amended from time to time, and applicable law.`),
      h(`11.11 Customer Responsibility`),
      p(`The Customer shall not provide or upload personal, confidential, or third-party information through the Platform unless the Customer is legally authorised to do so.`),
    ),
    sec('12', 'Payment',
      h(`12.1 Payment`),
      p(`The Customer shall pay the applicable charges for the Services directly to the relevant Service Provider, using the payment method made available or accepted by the Service Provider, where applicable. Payment may be made through UPI, credit/debit card, net banking, wallet, cash, or any other payment method made available through the Platform or by the Service Provider.`),
      p(`Where payment processing is enabled through the Platform, Near G Fix may facilitate or process the payment through its payment gateway or other third-party payment service provider on behalf of the relevant Service Provider, where applicable.`),
      h(`12.2 Invoice`),
      p(`The relevant Service Provider shall be responsible for issuing the applicable invoice or receipt for the Services provided to the Customer. Such invoice or receipt may be provided electronically through the Platform, email, WhatsApp, or any other applicable communication channel.`),
      h(`12.3 Additional Charges`),
      p(`Any additional charges arising from additional repair work, parts, Services, or other requirements shall be communicated by the Service Provider to the Customer and, where required under these Terms, shall be subject to the Customer's approval before the additional work is undertaken.`),
    ),
    sec('15', 'Refunds',
      h(`15.1 Refund Responsibility`),
      p(`Refunds relating to Services or payments made to a Service Provider shall generally be handled by the relevant Service Provider, subject to the applicable Service terms, payment arrangements, and applicable law.`),
      h(`15.2 Refund Processing`),
      p(`Where a refund is approved, it may be processed through the original payment method or applicable payment gateway. The time required for the refund to be credited may vary depending on the payment gateway, bank, card issuer, or other financial institution.`),
      h(`15.3 Near G Fix Fees`),
      p(`Any booking, platform, convenience, or other fee charged by Near G Fix, where applicable, shall be refundable only in accordance with the applicable terms communicated to the Customer and subject to applicable law.`),
      h(`15.4 Spare Parts`),
      p(`Amounts paid for spare parts shall generally be non-refundable once the parts have been ordered, installed, or otherwise supplied, except where a refund is required under applicable law or the applicable Service Provider's warranty or refund terms.`),
    ),
    sec('16', 'Device Loss, Damage & Liability',
      n('16.1', `The Service Provider shall be solely responsible for the Device while it is in its custody or control, including for any loss arising from its negligence, wilful misconduct or failure to exercise reasonable care.`),
      n('16.2', `The Service Provider shall be responsible for damage caused to the Device during repair or servicing due to its negligence, wilful misconduct or improper handling. Near G Fix shall not be responsible for any such loss or damage. Pre-existing defects, damage, wear and tear and inherent risks associated with repair shall remain subject to the applicable service terms.`),
      n('16.3', `The Service Provider responsible for pickup or delivery shall be responsible for any loss of or damage to the Device occurring while the Device is in its custody or control.`),
      n('16.4', `Near G Fix operates solely as a platform and intermediary connecting Customers with independent Service Providers. Near G Fix does not itself provide repair, servicing, custody, pickup or delivery services unless expressly stated otherwise. To the maximum extent permitted by applicable law, Near G Fix shall not be liable for any act, omission, negligence, misconduct, loss or damage attributable to a Service Provider.`),
      n('16.5', `To the maximum extent permitted by applicable law, Near G Fix's aggregate liability arising out of or in connection with the Platform or any transaction shall be limited to the amount actually paid by the Customer to Near G Fix in respect of the relevant transaction.`),
    ),
    sec('17', 'Used Mobile and Electronic Gadget Marketplace',
      n('17.1', `**Marketplace:** Near G Fix may facilitate the buying and selling of used mobile phones, tablets, laptops and other electronic gadgets (“Used Devices”) between Customers and participating Service Providers.`),
      n('17.2', `**Near G Fix’s Role**: Near G Fix operates solely as a technology platform and intermediary for listings, valuations, offers, bidding, negotiations and transaction facilitation. Unless expressly stated otherwise, Near G Fix does not purchase, own, sell or take title to any Used Device.`),
      n('17.3', `**Customer Sale:** Customers shall provide accurate information regarding the Device, including its condition, IMEI/serial number, ownership and material defects, and represent that they have lawful ownership or authority to sell the Device. Stolen, unlawfully obtained, financed or otherwise unlawfully transferable Devices shall not be listed.`),
      n('17.4', `**Bidding and Offers:** Near G Fix may enable Service Providers to submit bids or offers for Used Devices. A bid or offer shall not constitute a completed sale until accepted through the Platform and any applicable inspection, verification and payment requirements are satisfied. Near G Fix may cancel or suspend bids affected by fraud, manipulation, technical errors or breach of these Terms.`),
      n('17.5', `**Valuation:** Any valuation or estimated price provided through the Platform is indicative only and is not a guarantee of the final purchase price. The final price may depend on the Device’s condition, verification, inspection, market demand and the applicable offer or bidding process.`),
      n('17.6', `**Purchase of Used Devices:** Service Providers may list Used Devices for sale to Customers and shall be responsible for the accuracy of their listings, their right to sell the Device, and any applicable warranty or representation. Used Devices may show ordinary signs of use, wear, previous repairs or battery degradation.`),
      n('17.7', `**Payment and Transfer:** The purchase price and applicable charges shall be disclosed before completion of the transaction. Payment may be processed directly between the parties, as applicable. Ownership shall transfer in accordance with the applicable transaction terms and law.`),
      n('17.8', `**Device and Personal Data**: A Customer selling a Device shall remove personal data, accounts, SIM/memory cards and applicable activation or security locks before handover.`),
      n('17.9', `**Returns and Disputes:** Returns, refunds, exchanges and warranties shall be governed by the applicable transaction terms and law. Near G Fix may facilitate disputes but shall not assume the contractual obligations or liabilities of the Customer or Service Provider solely by providing the Marketplace.`),
      n('17.10', `**Prohibited Transactions and Liability**: Customer-to-Customer transactions and bidding are prohibited. Users shall not engage in fake bids, collusion, price manipulation or other fraudulent conduct. To the maximum extent permitted by law, Near G Fix shall not be liable for the acts, omissions, representations, condition, title, quality or performance of any Customer or Service Provider, except for liability arising from Near G Fix’s own acts or liability that cannot legally be excluded.`),
    ),
    sec('18', 'Prohibited Devices and Activities',
      n('18.1', `Near G Fix does not knowingly accept or facilitate transactions involving Devices that are confirmed to be stolen or unlawfully obtained. Where a Device is reasonably suspected of being stolen or unlawfully obtained, Near G Fix or the relevant Service Provider may request reasonable information or documentation and may refuse or suspend the relevant Service or transaction where required by applicable law.`),
      n('18.2', `Near G Fix shall not be liable or responsible for any loss, claim, damage, cost, or liability arising from or relating to a Device that is stolen, unlawfully obtained, fraudulently acquired, or otherwise not lawfully owned or possessed by the person presenting the Device for Service. The person presenting the Device represents and warrants that they have the lawful right, title, and authority to submit the Device for the relevant Service.`),
    ),
    sec('19', 'Ratings, Reviews and Content',
      n('19.1', `Customers may rate Service Providers and submit reviews based on their genuine experience with the Services.`),
      n('19.2', `Customers may upload photographs, videos, and other content through the Platform, subject to these Terms and applicable law.`),
      n('19.3', `Service Providers may respond to Customer ratings and reviews, provided that such responses are lawful, relevant, and respectful.`),
      n('19.4', `Customers and Service Providers shall not post, upload, or transmit any content that is:`),
      ol(`a. fake, fraudulent, or misleading, including fake reviews or ratings;
        b. abusive, threatening, harassing, or defamatory;
        c. offensive, obscene, indecent, or discriminatory;
        d. containing another person's personal, confidential, or sensitive information without lawful authority or consent; or
        e. promotional, commercial, unsolicited, or spam content, unless expressly permitted by Near G Fix.`),
      n('19.5', `Near G Fix shall not ordinarily remove or alter genuine reviews or User Content. However, Near G Fix may remove, restrict, disable access to, or take other appropriate action in relation to any content where required by applicable law, a court or governmental order, or where reasonably necessary to address unlawful, fraudulent, abusive, harmful, or security-related content or to protect the rights, safety, or legal interests of Near G Fix, Customers, Service Providers, or third parties.`),
      n('19.6', `Users are solely responsible for the content they post or submit and shall be responsible for any consequences arising from unlawful or prohibited content.`),
    ),
    sec('20', 'Customer Support and Complaints',
      n('20.1', `Customers may raise complaints, queries, or support requests through the support channels provided by Near G Fix, including in-app support, telephone, and WhatsApp.`),
      n('20.2', `Complaints relating to the quality, workmanship, repair, replacement of parts, or other technical aspects of a Service shall be handled primarily by the relevant Service Provider responsible for providing such Service.`),
      n('20.3', `Complaints relating to payments, charges, refunds, or other transaction-related matters shall be handled primarily by the relevant Service Provider, subject to the applicable Service terms and payment arrangements.`),
      n('20.4', `Where a Customer is unable to resolve a complaint directly with the Service Provider, the Customer may escalate the matter to Near G Fix through its Customer Support channels. Near G Fix may facilitate communication between the Customer and the Service Provider and may request the Service Provider to provide an appropriate response within a reasonable period.`),
      n('20.5', `Near G Fix's role in an escalated complaint is generally limited to facilitating communication and resolution between the Customer and the Service Provider, unless otherwise expressly agreed or required by applicable law.`),
    ),
    sec('21', 'User Account',
      n('21.1', `Near G Fix may suspend, restrict, or terminate a Customer's account where the Customer engages in fraud, payment fraud, misuse of the Platform, provides false or misleading information, abuses or harasses Service Providers, repeatedly cancels bookings or fails to attend scheduled appointments, or otherwise violates these Terms or applicable law.`),
      n('21.2', `A Customer may request closure of their account through the designated Near G Fix support channels. Near G Fix may retain account and transaction-related information where required or permitted by applicable law, or where reasonably necessary for legal, regulatory, security, fraud-prevention, accounting, dispute-resolution, or other legitimate business purposes.`),
      n('21.3', `The Customer is responsible for maintaining the confidentiality and security of their account credentials and for all activity carried out through their account, except where caused by circumstances beyond the Customer's reasonable control.`),
      n('21.4', `The Customer shall provide accurate, complete, and current information and shall promptly update such information where necessary.`),
    ),
    sec('22', 'Intellectual Property',
      p(`**All rights, title, and interest in and to the Near G Fix application, website, software, logo, trademarks, branding, design, content, and all related intellectual property are owned by or lawfully licensed to Near G Fix.** No Customer or Service Provider acquires any ownership rights in Near G Fix’s intellectual property by accessing or using the Platform or participating in its Services. Service Providers may use the Near G Fix name, logo, trademarks, or other branding only in accordance with a separate written agreement or express written authorisation from Near G Fix. Customers may use screenshots or other Platform content for lawful commercial purposes, provided that such use does not infringe Near G Fix’s intellectual property rights, misrepresent any affiliation or endorsement, or violate applicable law. Except as expressly permitted under these Terms, no person may copy, reproduce, modify, distribute, sell, license, reverse engineer, or otherwise commercially exploit any Near G Fix intellectual property without Near G Fix’s prior written consent.`),
    ),
    sec('23', 'Third-Party Services',
      n('23.1', `Near G Fix may use or integrate third-party services, including payment gateways, Google Maps or other mapping services, SMS providers, WhatsApp, delivery and logistics providers, cloud-hosting providers, analytics providers, and authentication or verification services.`),
      n('23.2', `Third-party services may be subject to the respective provider's terms, conditions, and privacy policies. Customers agree to comply with such terms where applicable.`),
      n('23.3', `Near G Fix is not responsible for the independent acts, omissions, availability, or performance of third-party service providers, except to the extent required under applicable law.`),
      n('23.4', `Near G Fix may replace, modify, suspend, or discontinue any third-party service where reasonably necessary for the operation of the Platform.`),
      n('23.5', `Where a third-party service processes Customer information, such processing shall be subject to applicable law and Near G Fix's Privacy Policy.`),
      n('23.6', `The use of third-party services does not create any partnership, agency, employment, or joint-venture relationship between Near G Fix and the relevant third-party provider unless expressly agreed in writing.`),
    ),
    sec('24', 'Platform Availability',
      p(`Near G Fix provides the Platform on an **"as is"** and **"as available"** basis. Near G Fix does not warrant that the Platform or its content will always be accurate, complete, reliable, uninterrupted, error-free, secure, or available at all times.`),
      p(`Users access and use the Platform at their own risk. To the extent permitted by applicable law, Near G Fix shall not be responsible for any loss, damage, cost, or inconvenience arising from errors, omissions, interruptions, technical failures, or reliance on information or content made available through the Platform.`),
    ),
    sec('25', 'Force Majeure',
      p(`Near G Fix shall not be liable for any delay, interruption, or failure in providing the Platform or Services to the extent caused by circumstances beyond its reasonable control, including:`),
      ul(`natural disasters, fire, flood, or other acts of nature;
        epidemic or pandemic;
        war, terrorism, civil unrest, or public disturbance;
        governmental action, order, restriction, or regulation;
        telecommunications or internet infrastructure failure;
        power outages or infrastructure failures;
        cyber incidents or security events;
        strikes, lockouts, or labour disruptions; and
        failure or interruption of third-party services or infrastructure.`),
    ),
    sec('26', 'Dispute Resolution, Arbitration and Jurisdiction',
      p(`In the event of any dispute, difference or claim arising out of or relating to these Terms or the use of the Platform, the Customer shall first raise the matter with the **Near G Fix Customer Support Team** through the contact details provided in **Clause 36.** Near G Fix will make reasonable efforts to review and resolve the matter through its customer support and grievance-resolution process.`),
      p(`If the matter is not resolved through the Customer Support Team, the parties shall endeavour to resolve the dispute amicably through mutual discussions within thirty (30) days from the date on which the dispute is formally raised.`),
      p(`If the dispute remains unresolved, any dispute that is legally capable of being referred to arbitration may be referred to and finally resolved by arbitration in accordance with the Arbitration and Conciliation Act, 1996, as amended from time to time. The arbitration shall be conducted by a sole arbitrator mutually appointed by the parties in accordance with applicable law. The seat and venue of arbitration shall be Cuddalore, Tamil Nadu, India, and the proceedings shall be conducted in English.`),
      p(`The arbitral award shall be final and binding on the parties, subject to applicable law. Matters that are not legally capable of being referred to arbitration, or that require the intervention of any governmental, regulatory, statutory or law-enforcement authority, shall be dealt with by the competent authority or court in accordance with applicable law.`),
      p(`Nothing in this Clause shall restrict or exclude any mandatory rights, remedies or statutory forums available to a Customer under applicable law.`),
      p(`Subject to applicable law, the competent courts at Cuddalore, Tamil Nadu, India shall have jurisdiction over matters arising out of or relating to these Terms that are not subject to arbitration.`),
    ),
    sec('27', 'Modification of Services',
      p(`Near G Fix may add, modify, suspend, or discontinue Platform features or Services, including repair categories, Service Providers, payment methods, pickup or delivery arrangements, used-device features, subscription plans, chatbot functionality, geographic availability, or other Platform functionalities.`),
      p(`Where required by applicable law, Near G Fix shall provide appropriate notice of material changes.`),
    ),
    sec('28', 'Changes to These Terms',
      p(`Near G Fix may amend or update these Terms from time to time to reflect changes in the Platform, Services, business practices, technology, or applicable law.`),
      p(`The updated Terms may be published on the Platform with a revised "Last Updated" date. Where required by applicable law, Near G Fix shall provide appropriate notice of material changes.`),
      p(`Continued use of the Platform after the effective date of the revised Terms shall constitute acceptance of the revised Terms to the extent permitted by applicable law.`),
    ),
    sec('29', 'Indemnification',
      p(`To the extent permitted by applicable law, the Customer shall indemnify and hold harmless Near G Fix, its directors, officers, employees, and representatives from claims, losses, liabilities, damages, costs, and reasonable expenses arising directly from the Customer's:`),
      ol(`a. fraud or wilful misconduct;
        b. unlawful conduct;
        c. material breach of these Terms;
        d. infringement of any third-party intellectual property or other rights;
        e. misuse of the Platform;
        f. submission of a stolen or unlawfully possessed Device;
        g. provision of materially false or misleading information; or
        h. unauthorised use of another person's account, payment method, or information.`),
      p(`Nothing in this Section shall require a Customer to indemnify Near G Fix to the extent prohibited or restricted by applicable law or to the extent the claim arises from Near G Fix's own negligence, wilful misconduct, or other legally attributable conduct.`),
    ),
    sec('30', 'Relationship Between Customer and Service Provider',
      p(`Where a Customer obtains a repair, used Device, or other Service directly from a Service Provider, the contractual relationship relating to that Service shall be between the Customer and the relevant Service Provider, except where Near G Fix expressly acts as a contracting party.`),
      p(`Near G Fix may facilitate discovery, booking, communication, payment processing, notifications, records, customer support, or other technology-enabled functions. Such facilitation does not, by itself, make Near G Fix a party to the underlying transaction or Service.`),
    ),
    sec('31', 'Independent Service Providers',
      p(`Service Providers are independent businesses and are not employees, agents, partners, joint venturers, franchisees, or representatives of Near G Fix merely because they are listed on or use the Platform.`),
      p(`Except where expressly stated otherwise, the relevant Service Provider is responsible for performing the applicable repair, diagnosis, maintenance, replacement, or other physical Service.`),
      p(`The Service Provider shall remain primarily responsible for matters arising directly from its Services, including workmanship, pricing, parts used, applicable warranties, repair-related complaints, invoices, lawful operation of its business, and Devices while in its custody.`),
      p(`Nothing in these Terms creates an employment, agency, partnership, or joint-venture relationship between Near G Fix and any Service Provider or its personnel.`),
    ),
    sec('32', 'Severability',
      p(`If any provision of these Terms is held to be invalid, unlawful, or unenforceable, such provision shall, to the extent legally permissible, be modified or interpreted to give effect to its intended purpose.`),
      p(`The invalidity or unenforceability of any provision shall not affect the validity and enforceability of the remaining provisions.`),
    ),
    sec('33', 'Waiver',
      p(`No failure or delay by Near G Fix in exercising any right, power, or remedy under these Terms shall constitute a waiver of that right, power, or remedy. Any waiver shall be effective only if expressly made in writing by Near G Fix.`),
    ),
    sec('34', 'Assignment',
      p(`The Customer shall not assign, transfer, or otherwise dispose of any rights or obligations under these Terms without the prior written consent of Near G Fix.`),
      p(`Near G Fix may assign or transfer its rights and obligations under these Terms in connection with a merger, acquisition, restructuring, sale of business or assets, corporate reorganisation, or other lawful transaction, subject to applicable law.`),
    ),
    sec('35', 'Entire Agreement',
      p(`These Terms, together with the Privacy Policy and any applicable Service-specific terms, booking terms, subscription terms, warranty terms, payment terms, and other terms expressly incorporated into the Platform, constitute the agreement governing the Customer's use of the Platform and Services, subject to any mandatory provisions of applicable law.`),
      p(`In the event of a conflict between these Terms and a specific written agreement applicable to a particular Service or transaction, the specific agreement shall prevail to the extent of the inconsistency.`),
    ),
    sec('36', 'Contact Information',
      p(`For customer support and Platform-related enquiries:`),
      p(`**Globogreen System and Technology Pvt. Ltd.**
**Brand:** Near G Fix
**Website:** neargfix.com`),
      p(`**Registered Office:**
No. 1/16, South Street,
Villiyanallur, Bhuvanagiri Taluk,
Tamil Nadu, India.`),
      p(`**NearGFix Customer Support:**
**Email:** support@neargfix.com
**Phone:** +91 81241 23452
**WhatsApp:** +91 81241 23452`),
    ),
    sec('37', 'Acceptance of Terms',
      p(`By accessing or using the Platform, registering an account, making a booking, providing or receiving any Service, or otherwise using any Near G Fix Service, the Customer and Service Provider confirm that they have read, understood, and agreed to these Terms and the applicable Privacy Policy.`),
    ),
  ],
};

const PRIVACY = {
  type: LEGAL_DOC_TYPES.PRIVACY,
  version: '2026-07-19',
  screenTitle: 'Privacy Policy',
  heading: 'Privacy Policy',
  effectiveDate: '19 July 2026',
  lastUpdated: '19 July 2026',
  intro: [
    p(`This Privacy Policy explains how **Globogreen System and Technology Pvt. Ltd.**, trading under the brand name **Near G Fix** ("**Near G Fix**", "**Company**", "**we**", "**us**" or "**our**"), collects, uses, stores, shares and otherwise processes personal information when you access or use the Near G Fix website, mobile application, technology platform, marketplace, repair and service-booking facilities, and related services (collectively, the "**Platform**").`),
    p(`The Platform is operated by: **Globogreen System and Technology Pvt. Ltd.**
**Trading/Brand Name:** Near G Fix
**Registered Office:** No. 1/16, South Street, Villiyanallur, Bhuvanagiri Taluk, Tamil Nadu, India
**Website:** neargfix.com`),
    p(`A person accessing or using the Platform is referred to as "**Customer**", "**User**", "**you**" or "**your**".`),
    p(`Independent repair shops, mobile shops, electronics shops, technicians and other businesses listed or connected through the Platform are referred to as "**Service Providers**", "**Shops**", "**Partner Shops**" or "**SPs**".`),
    p(`This Privacy Policy should be read together with the Near G Fix Terms and Conditions and any other applicable policies, notices or agreements made available through the Platform.`),
    p(`By registering for an account, accessing the Platform, booking a service, submitting a Device for inspection or repair, communicating with a Shop through the Platform, purchasing or selling a used Device through the Platform, or otherwise using any Near G Fix service, you acknowledge that you have read and understood this Privacy Policy.`),
    p(`If you do not agree with this Privacy Policy, please do not use the Platform or provide personal information to Near G Fix.`),
  ],
  sections: [
    sec('1', 'About Near G Fix',
      p(`Near G Fix operates a technology platform that connects Customers with independent Service Providers and facilitates electronic-device repair, servicing, inspection, pickup and delivery, customer support, and the buying and selling of used electronic Devices through its marketplace functionality.`),
      p(`Depending on the functionality available to you, the Platform may enable you to:`),
      ul(`search for nearby Service Providers;
        book Repair Services;
        submit a Device for inspection, pickup, delivery, repair or other service;
        communicate with Service Providers and other participating users in connection with a transaction;
        track service, pickup or delivery status;
        obtain repair estimates and service information;
        list eligible used Devices for sale;
        view, search, compare and evaluate listings for Used Devices;
        submit or receive bids, offers or purchase requests for Used Devices;
        negotiate or communicate regarding the purchase or sale of Used Devices through Platform-enabled functionality;
        receive warranty, return, dispute or post-transaction support;
        communicate with Near G Fix customer support; and
        use other features introduced by Near G Fix from time to time.`),
      p(`Near G Fix generally acts as a technology platform and intermediary for marketplace activities. Unless expressly stated otherwise, Near G Fix does not purchase, own, sell, take title to, or independently warrant any Used Device merely by providing marketplace, listing, valuation, bidding, communication, payment-facilitation or transaction-facilitation functionality.`),
      p(`Service Providers and other participating businesses are independent third parties. Their own privacy practices may apply to information they collect or process independently of Near G Fix.`),
    ),
    sec('2', 'Eligibility and Children',
      p(`The Platform is intended for persons who are **18 years of age or older**.`),
      p(`Near G Fix does not knowingly intend to collect personal information from children or persons below the applicable age of consent.`),
      p(`If we become aware that personal information relating to a child has been collected without the required consent or legal basis, we may take reasonable steps to delete or otherwise appropriately handle that information.`),
      p(`Where age verification is required, Near G Fix may request appropriate information, such as date of birth or legally permissible identity/age verification information.`),
      p(`If you believe that a child has provided personal information to Near G Fix, please contact us using the details provided in this Privacy Policy.`),
    ),
    sec('3', 'Personal Information We Collect',
      p(`The information we collect depends on how you use the Platform, including whether you use the Platform as a Customer, seller, buyer, Service Provider, or other participant in a marketplace transaction.`),
      h(`3.1 Identity Information`),
      p(`We may collect:`),
      ul(`full name;
        date of birth, where required;
        gender;
        profile photograph;
        Customer photograph;
        government-issued identification information where required for verification, used-device transactions, fraud prevention or legal compliance;
        information relating to ownership or authority to sell a Device;
        information reasonably necessary to verify a seller, buyer or transaction participant; and
        other identity information voluntarily provided by you.`),
      h(`3.2 Contact Information`),
      p(`We may collect:`),
      ul(`mobile number;
        email address;
        residential address;
        pickup address;
        delivery address;
        alternate telephone number;
        contact details required to facilitate communication between transaction participants; and
        other contact information you provide.`),
      h(`3.3 Account Information`),
      p(`We may collect:`),
      ul(`username;
        account ID;
        password or authentication credentials;
        OTP-related information;
        login information;
        account creation information;
        login history;
        authentication and security information;
        account preferences;
        marketplace activity associated with your account; and
        information concerning listings, bids, offers, purchases, sales and other transactions associated with your account.`),
      p(`Near G Fix will use reasonable security measures to protect authentication information and will not intentionally request your password for purposes unrelated to authentication or a legitimate technical/service requirement.`),
      h(`3.4 Location Information`),
      p(`Depending on the permissions you provide and the features you use, we may collect:`),
      ul(`precise location;
        approximate location;
        current location;
        pickup location;
        delivery location; and
        location information associated with a service booking.`),
      p(`Location information may be used to find nearby Service Providers, display nearby shops, facilitate pickup and delivery, provide navigation or tracking, determine service availability, improve security and fraud prevention, and support relevant Platform functions.`),
      p(`You may control location permissions through your device settings. Certain features may not function fully if location access is disabled.`),
    ),
    sec('4', 'Device and Technical Information',
      p(`When you use the Near G Fix application or website, we may collect information relating to the Device used to access the Platform.`),
      p(`Depending on the feature and permissions involved, this may include:`),
      ul(`device make and model;
        IMEI number, where legitimately required;
        serial number;
        operating system and OS version;
        Device ID;
        advertising identifier;
        IP address;
        application version;
        network information;
        SIM-related information where technically necessary;
        Device parts information;
        device condition information;
        Google account-related information where technically necessary for a service;
        iCloud/Apple account-related information where technically necessary for a service; and
        technical or diagnostic information.`),
      p(`Device information may be used by Near G Fix for booking and service identification, maintaining repair and service records, providing customer support, verifying Devices, preventing fraud and unauthorised activity, facilitating service diagnosis, administering warranties, troubleshooting technical issues, maintaining the security and integrity of the Platform and related services, and for other legitimate purposes reasonably necessary to provide, maintain, improve, and secure Near G Fix's services.`),
    ),
    sec('5', 'Device Access, Security Credentials and Customer Responsibility',
      n('5.1', `Certain repair, maintenance, testing, diagnostic, software-related, or device verification services may, where reasonably necessary, require access to the Customer’s Device. In such circumstances, the Customer may be requested to provide a Device password, PIN, pattern, biometric authentication, or other security credential solely to the extent necessary to perform the requested service.`),
      n('5.2', `**The Customer shall provide such credentials only where reasonably necessary for the provision of the requested service.** Near G Fix and its authorised Service Providers shall use any credentials provided by the Customer solely for the specific and authorised purpose for which such credentials were provided, including repair, testing, diagnosis, configuration, software-related services, or device verification, as applicable. Such credentials shall not be used to access, review, copy, disclose, modify, or otherwise interfere with personal information, files, applications, communications, accounts, or other content unrelated to the requested service, except where such access is strictly necessary to perform the authorised service.`),
      n('5.3', `Where technically feasible and appropriate to the requested service, Customers are strongly advised to:`),
      ul(`back up all data and content stored on the Device before handing the Device over to Near G Fix, a Service Provider, pickup or delivery personnel, or any other third party;
        remove, transfer, or otherwise secure sensitive, confidential, or private information from the Device before handing it over;
        use a temporary, limited-purpose, or service-specific credential, where the Device supports such functionality;
        disable or restrict security, privacy, or other sensitive features where appropriate and where doing so does not interfere with the requested service; and
        refrain from providing any password, PIN, authentication credential, or other security information that is not reasonably necessary for the requested service.`),
      n('5.4', `**The Customer acknowledges and agrees that the Customer remains solely responsible for backing up the Device and safeguarding the Customer’s data, personal information, credentials, accounts, and other content before handing over or otherwise providing access to the Device to Near G Fix, any Service Provider, pickup or delivery personnel, or any other third party.**`),
      n('5.5', `To the extent permitted by applicable law, **Near G Fix shall not be responsible for any loss, corruption, alteration, disclosure, or unavailability of data or content stored on the Device arising from circumstances beyond Near G Fix’s reasonable control, including any failure by the Customer to maintain an adequate backup or to remove or secure sensitive information prior to providing the Device for service.**`),
      n('5.6', `The Customer should not provide any credential that would grant access to unrelated accounts, services, or information where such credential is not reasonably necessary for the requested service.`),
    ),
    sec('6', 'Service Information, Device Content and Application Permissions',
      h(`6.1 Service and Repair Information`),
      p(`When you request, schedule, or receive services through the Platform, Near G Fix may collect and process information reasonably necessary to provide, administer, document, and support the requested service, including:`),
      ul(`Device make, model, configuration, specifications, and other Device details;
        IMEI, serial number, or other Device identifiers;
        details of the repair or service request;
        the service selected or requested;
        diagnostic, inspection, testing, and troubleshooting information;
        repair estimates, quotations, and pricing information;
        repair and service history;
        details of parts replaced, installed, or serviced;
        applicable warranty and service-contract information;
        Service Provider details;
        service booking and status information;
        photographs and videos documenting the condition of the Device;
        Customer complaints, requests, feedback, and other service-related communications;
        service, repair, testing, and technical records;
        estimated service completion or delivery times;
        pickup, transportation, delivery, and handover information; and such other information as is reasonably necessary to provide, administer, verify, secure, or improve the requested service.`),
      h(`6.2 Access to Device Content`),
      p(`Certain repair, diagnostic, testing, software, data-recovery, or device-verification services may require a Service Provider to access information stored on the Device. Such access may be necessary, for example, to:`),
      ul(`diagnose hardware or software issues;
        test Device functionality;
        install, remove, configure, or update software;
        verify that a repair or service has been successfully completed;
        perform data recovery where specifically requested by the Customer;
        troubleshoot an application, operating-system, or software-related issue; or
        perform another service expressly requested or authorised by the Customer.`),
      p(`Any such access should be limited, to the extent reasonably practicable, to the information and functionality necessary to perform the relevant service.`),
      p(`Depending on the nature of the service and the technical characteristics of the Device, a Service Provider may incidentally encounter photographs, videos, contacts, messages, files, applications, documents, or other content stored on the Device. Near G Fix does not authorise Service Providers to access, use, copy, disclose, modify, or retain Customer content for purposes unrelated to the provision of the authorised service, except where otherwise permitted or required by applicable law.`),
      h(`6.3 Device Credentials`),
      p(`Where reasonably necessary for the provision of a requested service, a Customer may be asked to provide a Device password, PIN, pattern, authentication method, or other security credential.`),
      p(`Customers should provide such credentials only where necessary for the relevant service. Near G Fix and its authorised Service Providers shall use credentials provided by a Customer solely for the authorised repair, testing, diagnosis, verification, configuration, or other service purpose for which the credentials were provided and shall not use such credentials to access unrelated personal information or content.`),
      p(`Where technically feasible, Customers are encouraged to:`),
      ul(`back up their Device before submitting it for service;
        remove or secure sensitive or private information where reasonably practicable;
        use a temporary or service-specific credential where supported by the Device;
        disable or restrict sensitive security features where appropriate and where doing so does not interfere with the requested service; and
        avoid providing credentials that are not reasonably necessary for the requested service.`),
      p(`Customers remain responsible for maintaining appropriate backups and safeguarding their personal information, accounts, credentials, and other content before handing over or providing access to a Device to Near G Fix, a Service Provider, pickup or delivery personnel, or any other third party.`),
      h(`6.4 Retention of Device Content`),
      p(`Near G Fix does not ordinarily collect or permanently retain the contents of personal files, photographs, videos, messages, contacts, applications, or other personal content merely because a Device is submitted for repair or service.`),
      p(`Where personal content is accessed, extracted, transferred, or otherwise processed in connection with a service, Near G Fix will retain such content only for as long as is reasonably necessary to provide or complete the relevant service, or as otherwise permitted or required under applicable law.`),
      p(`Near G Fix will not ordinarily retain extracted personal content after completion of the relevant service, except where:`),
      ul(`the Customer has specifically requested a service that requires such retention;
        retention is reasonably necessary for a legitimate and authorised service purpose;
        retention is required or permitted under applicable law, including any applicable statutory or regulatory requirement, court order, legal process, or direction of a competent governmental, regulatory, law-enforcement, or judicial authority;
        retention is reasonably necessary to establish, exercise, or defend Near G Fix's legal rights or claims, comply with legal or regulatory obligations, or assist with the prevention, detection, investigation, or prosecution of unlawful activity; or
        another lawful basis for such retention applies.`),
      p(`**Where retention is required or permitted under applicable law, Near G Fix will retain the relevant personal content only for the period and to the extent reasonably necessary to satisfy the applicable legal, regulatory, compliance, or legitimate business requirement.** Upon expiry of the applicable retention period, Near G Fix will securely delete, destroy, anonymise, or otherwise dispose of such personal content in accordance with applicable law and Near G Fix's data retention practices.`),
      h(`6.5 Photographs, Videos and Other Recordings`),
      p(`Near G Fix and/or its authorised Service Providers may create or collect photographs, videos, or other visual records of the Device and, where reasonably necessary, the service or handover environment.`),
      p(`Such records may be created or collected during:`),
      ul(`pickup;
        inspection;
        diagnosis;
        repair or servicing;
        testing;
        delivery;
        handover; or
        investigation or resolution of a complaint, dispute, warranty claim, or suspected fraud.`),
      p(`Such photographs, videos, or recordings may be used for legitimate service-related purposes, including:`),
      ul(`documenting and verifying the condition of a Device;
        Device identification and verification;
        maintaining pickup, delivery, and handover records;
        maintaining repair and service records;
        investigating and resolving complaints or disputes;
        fraud prevention and security;
        customer support;
        warranty and service administration; and
        maintaining other records reasonably necessary for the provision, administration, or protection of the relevant service.`),
      p(`Such records may be shared with relevant Service Providers, authorised pickup or delivery personnel, customer support personnel, insurers, or other authorised third parties where reasonably necessary for the applicable service-related purpose or otherwise permitted or required by law.`),
      h(`6.6 Application Permissions`),
      p(`The Near G Fix application may request access to certain Device functions, information, or permissions depending on the features and services you choose to use. The permissions requested may include the following:`),
      ol(`**a. Camera:** Camera access may be used to capture photographs or videos of a Device, document its condition, or upload visual information in connection with a service request.
        **b. Photos, Media and Files:** Access may be used to upload Device photographs or videos, attach files or documents to support requests, or perform other functions expressly initiated by you.
        **c. Location:** Location information may be used, where relevant and permitted, to facilitate pickup and delivery, identify nearby Service Providers, determine service availability, support navigation, and provide relevant service tracking or status information.
        **d. Microphone:** Microphone access may be used where you choose to record a voice complaint, voice message, service-related recording, or other communication through the Platform.
        **e. Contacts:** Contacts access may be requested where a Platform feature allows you to select a saved contact or initiate communication using a contact stored on your Device. Near G Fix will seek to limit the use of contact information to the feature or purpose for which access has been granted.
        **f. Phone/Call:** Phone-related permissions may be used to facilitate calls or other communications between you, Near G Fix, and/or Service Providers in connection with the requested service.
        **g. SMS:** SMS access may be used, where technically supported and permitted, for OTP, authentication, verification, or other security-related functionality.
        **h. Notifications:** Notification permissions may be used to provide service-related communications, including OTPs, booking confirmations, appointment reminders, service-status updates, pickup and delivery notifications, warranty notifications, customer-support communications, and other relevant service notifications.`),
      p(`You may manage or withdraw certain application permissions through your Device settings, subject to the functionality and controls provided by your Device or operating system. However, disabling or restricting a permission may prevent or limit your ability to use certain Platform features or receive particular services or communications.`),
      h(`6.7 Marketplace Listings, Communications and Transaction Information`),
      p(`Where you use the Near G Fix marketplace to buy or sell a Used Device, Near G Fix may collect and process information reasonably necessary to create, display, administer, verify, facilitate and document the relevant marketplace activity. This may include:`),
      ul(`Device make, model and variant;
        IMEI, serial number or other Device identifiers;
        Device condition and usage information;
        battery health or other technical information, where available;
        photographs and videos of the Device;
        information concerning defects, damage, repairs, modifications or other material characteristics;
        seller-provided descriptions and declarations;
        information relating to ownership or authority to sell;
        indicative valuations or estimated prices;
        listing information;
        bids and offers;
        accepted or rejected offers;
        purchase requests;
        transaction status;
        agreed or final transaction price;
        payment and settlement information;
        pickup, delivery and handover information;
        buyer and seller communications made through Platform-enabled functionality;
        complaints, disputes, return or refund requests;
        warranty or post-sale information; and
        other information reasonably necessary to facilitate, verify, secure or document the transaction.`),
      p(`Where a customer lists a Used Device for sale, Near G Fix may use relevant information provided by the Customer to create and display the listing to eligible users, participating Service Providers or other authorised marketplace participants.`),
      p(`Near G Fix may also make available information concerning a listing, including the Device's make, model, condition, photographs, indicative price, location at an appropriate level of generality, and other information reasonably necessary to facilitate the transaction. Near G Fix will seek to avoid displaying unnecessary personal information publicly through a marketplace listing.`),
      p(`Near G Fix may facilitate communications between buyers, sellers and participating Service Providers through telephone, SMS, WhatsApp, in-app messaging, email or other communication channels enabled by the Platform. Where reasonably necessary to facilitate a transaction, relevant contact or transaction information may be shared with the applicable transaction participant.`),
      p(`Near G Fix may record and retain marketplace communications, bids, offers and transaction-related information for customer support, fraud prevention, dispute resolution, transaction verification, compliance, audit, legal and legitimate business purposes.`),
    ),
    sec('7', 'How We Collect Personal Information',
      p(`Near G Fix may collect personal information directly from you, through your use of the Platform, booking and transaction forms, customer support, Service Providers, pickup and delivery personnel, payment and technology providers, cookies and analytics tools, Device inspections and service records, marketplace activities, publicly available sources, and other lawful sources.`),
    ),
    sec('8', 'Purposes for Which We Use Personal Information',
      p(`Near G Fix may process personal information as reasonably necessary to:`),
      ul(`provide and administer repair, service, pickup and delivery facilities;
        operate and facilitate the Used Device marketplace, including listings, bids, offers, purchases and sales;
        connect Customers with Service Providers, buyers and sellers;
        verify identity, Device ownership, eligibility, condition and transactions;
        process payments and maintain transaction records;
        provide customer support and manage warranties, returns and disputes;
        prevent fraud, theft, misuse and unlawful or unauthorised activity;
        maintain the security, functionality and integrity of the Platform;
        comply with applicable legal, regulatory and law-enforcement requirements;
        establish, exercise or defend legal rights and claims; and
        perform other purposes reasonably necessary to provide, administer, secure or improve Near G Fix's services or as otherwise permitted or required by applicable law.`),
    ),
    sec('9', 'Transactional and Marketing Communications',
      h(`9.1 Transactional Communications`),
      p(`Near G Fix may send service-related communications including:`),
      ul(`OTPs;
        booking confirmations;
        appointment reminders;
        payment confirmations;
        repair-status notifications;
        pickup notifications;
        delivery notifications;
        warranty notifications;
        customer-support communications; and
        service-status notifications.`),
      p(`These communications may be sent even if you have opted out of promotional communications where they are necessary to provide the requested service.`),
    ),
    sec('10', 'Marketing Communications',
      p(`Where permitted by applicable law, Near G Fix may send promotional communications regarding:`),
      ul(`Near G Fix services;
        offers;
        discounts;
        partner services;
        products;
        marketplace opportunities; and
        other relevant promotions.`),
      p(`Marketing communications may be sent through:`),
      ul(`SMS;
        email;
        push notifications;
        WhatsApp; and
        telephone calls.`),
      p(`You may opt out of promotional communications through the available unsubscribe or preference mechanisms.`),
    ),
    sec('11', 'Sharing Information with Service Providers and Marketplace Participants',
      p(`Near G Fix may share relevant Customer information with Service Providers, buyers, sellers, pickup and delivery partners and other authorised marketplace participants where reasonably necessary to fulfil a booking, repair, sale, purchase, pickup, delivery, support request or other transaction.`),
      p(`Depending on the nature of the transaction, a Service Provider or marketplace participant may receive:`),
      ul(`Customer name;
        mobile number;
        email address;
        relevant pickup or delivery information;
        Device details;
        IMEI or serial number, where reasonably necessary;
        repair or inspection information;
        marketplace listing information;
        bids or offers;
        transaction details;
        Device photographs;
        relevant service or transaction communications;
        payment or transaction status; and
        other information reasonably necessary for the requested service or marketplace transaction.`),
      p(`Where a Customer lists a Used Device for sale, Near G Fix may disclose relevant listing and Device information to eligible buyers or participating Service Providers for the purpose of evaluating, bidding for, purchasing or otherwise transacting in relation to the Used Device.`),
      p(`Near G Fix may limit or mask certain personal information in public or semi-public marketplace listings and may disclose additional information only when reasonably necessary to facilitate a transaction or where permitted or required by applicable law.`),
      p(`Service Providers, buyers, sellers and other marketplace participants are independent third parties and may have their own privacy policies and legal obligations.`),
      p(`Near G Fix expects participating Service Providers and other authorised marketplace participants to handle Customer information responsibly and only for legitimate purposes connected with the relevant service or transaction.`),
    ),
    sec('12', 'Cookies and Tracking Technologies',
      p(`The Near G Fix website may use cookies and similar technologies.`),
      p(`The Platform may also use software development kits (SDKs), analytics technologies, crash-reporting tools, pixels, logs and similar technologies.`),
      p(`These technologies may be used for:`),
      ul(`essential Platform functionality;
        login and session management;
        analytics;
        performance monitoring;
        personalisation;
        advertising, where applicable;
        fraud prevention;
        security; and
        improving Platform functionality.`),
      p(`You may be able to control cookies through your browser settings. Disabling certain cookies may affect website functionality.`),
    ),
    sec('13', 'Third-Party Services and Technology Providers',
      p(`Near G Fix may use third-party technology and service providers to operate and improve the Platform.`),
      p(`These may include:`),
      ul(`Google Maps;
        Firebase;
        Google Analytics;
        payment gateway providers;
        SMS providers;
        WhatsApp;
        cloud hosting providers;
        crash-reporting providers;
        customer-support platforms;
        push-notification providers;
        AI chatbot or artificial-intelligence service providers; and
        other technology providers necessary to operate the Platform.`),
      p(`The specific third parties used by Near G Fix may change over time.`),
      p(`Where third-party providers process personal information on behalf of Near G Fix, Near G Fix may require appropriate contractual, technical or organisational safeguards, subject to applicable law and the nature of the service.Third-party services may also have their own privacy policies and terms.`),
    ),
    sec('14', 'AI Chatbot and Automated Technologies',
      p(`Near G Fix may use AI-powered or automated technologies, including an AI chatbot, to provide customer support, answer questions, assist with service discovery, collect service information or improve customer interactions.`),
      p(`You should avoid submitting unnecessary sensitive personal information through an AI chatbot.`),
      p(`Information provided through such functionality may be processed by Near G Fix and/or the relevant technology provider to provide the requested functionality, maintain security, troubleshoot the service and improve customer support, subject to applicable law and the terms applicable to the relevant service.`),
    ),
    sec('15', 'Used Device Marketplace',
      n('15.1', `Near G Fix may facilitate, through the Platform, the buying and selling of used mobile phones, tablets, laptops and other eligible electronic gadgets ("Used Devices") between Customers and participating Service Providers.`),
      n('15.2', `Near G Fix acts solely as a technology platform and intermediary for listings, valuations, bids, offers, negotiations and transaction facilitation. Unless expressly agreed otherwise, Near G Fix does not purchase, own, sell or take title to any Used Device. The sale or purchase transaction is between the relevant Customer and Service Provider, subject to the applicable transaction terms and law.`),
      n('15.3', `In connection with such transactions, Near G Fix may collect and process relevant information, including identity and contact details, Device details, IMEI/serial number, ownership and condition information, photographs, listings, valuations, bids, offers, transaction and payment records, and related communications, for purposes including transaction facilitation, verification, customer support, fraud prevention, dispute resolution, record-keeping and compliance with applicable law.`),
      n('15.4', `Customers selling Used Devices are responsible for removing personal data, accounts, SIM/memory cards, activation locks and other personal content before handover, to the extent reasonably practicable. Near G Fix does not ordinarily access or retain personal content stored on a Device except where reasonably necessary for an authorised service or where otherwise permitted or required by applicable law.`),
      n('15.5', `Near G Fix may suspend, reject, restrict or remove any listing, bid, offer or transaction where reasonably necessary to prevent fraud, misuse or unlawful activity, or where a Device is suspected to be stolen, unlawfully obtained, counterfeit, blocked, tampered with or otherwise ineligible. Near G Fix may disclose relevant information to competent authorities where required or permitted by applicable law.`),
      n('15.6', `Near G Fix may retain marketplace and transaction information for as long as reasonably necessary to provide the relevant services, prevent fraud, resolve disputes, comply with applicable legal or regulatory requirements, establish or defend legal claims, or maintain legitimate business records.`),
      n('15.7', `**Customer-to-Customer transactions are not permitted through the Near G Fix Marketplace.**`),
    ),
    sec('16', 'Data Storage and Cross-Border Transfers',
      n('16.1', `Near G Fix stores and processes personal information using its systems and/or cloud infrastructure, including third-party hosting and technology service providers. Near G Fix currently maintains its primary Customer data storage and processing infrastructure in India.`),
      n('16.2', `Near G Fix does not currently intend to transfer Customer personal information outside India. However, where any third-party service provider processes or accesses personal information from outside India due to its infrastructure, technical operations or support arrangements, such processing or access will be subject to applicable law.`),
      n('16.3', `If Near G Fix undertakes any cross-border transfer, storage or access of personal information in the future, Near G Fix will do so in accordance with all applicable data-protection and privacy laws, rules, regulations and governmental requirements then in force, including any requirements applicable to cross-border transfers of personal information.`),
      n('16.4', `Where required by applicable law, Near G Fix will implement appropriate safeguards, contractual measures, security measures, approvals or other legally prescribed requirements before undertaking such cross-border transfer or access.`),
    ),
    sec('17', 'Data Security',
      p(`Near G Fix takes reasonable measures designed to protect personal information against:`),
      ul(`unauthorised access;
        unauthorised disclosure;
        alteration;
        misuse;
        destruction;
        accidental loss; and
        other unlawful or unauthorised processing.`),
      p(`Security measures may include access controls, authentication, encryption where appropriate, secure infrastructure, logging, monitoring and other technical or organisational safeguards.`),
      p(`However, no electronic system, transmission or storage method can be guaranteed to be completely secure.`),
      p(`You are responsible for maintaining the confidentiality of your account credentials and should promptly notify Near G Fix if you believe your account has been compromised.`),
    ),
    sec('18', 'Customer Responsibilities Regarding Devices',
      p(`Before handing a Device to Near G Fix, a Service Provider, pickup personnel or another authorised party, you should, where reasonably possible:`),
      ul(`back up your data;
        remove sensitive or unnecessary personal information;
        sign out of personal accounts where appropriate;
        remove SIM cards and memory cards where appropriate;
        disable security features where required for the requested service;
        avoid providing unnecessary passwords or authentication information; and
        inform the Service Provider about any important data or security considerations.`),
      p(`**Near G Fix is not responsible for loss of data resulting from repair, testing, software operations, Device malfunction, Device reset, formatting, replacement, damage or other technical service activities, except to the extent liability cannot lawfully be excluded.**`),
    ),
    sec('19', 'Your Rights and Choices',
      p(`Subject to applicable law and the nature of the processing, you may have rights relating to your personal information, which may include:`),
      ul(`requesting information about processing of your personal information;
        requesting access to applicable personal information;
        requesting correction of inaccurate or incomplete information;
        requesting deletion or erasure where legally available;
        withdrawing consent where processing is based on consent;
        requesting grievance redressal;
        managing certain communication preferences; and
        exercising other rights available under applicable law.`),
      p(`Requests may be subject to identity verification and applicable legal limitations.`),
      p(`Where processing is necessary to provide a requested service or is otherwise permitted or required by law, withdrawal of consent may not result in immediate deletion or cessation of all processing.`),
    ),
    sec('20', 'Data Breaches and Security Incidents',
      p(`If Near G Fix becomes aware of a personal-data breach or security incident requiring notification under applicable law, Near G Fix will take reasonable steps to investigate, contain, mitigate and remediate the incident and provide notifications to affected persons and/or authorities where required by applicable law.`),
    ),
    sec('21', 'Third-Party Websites and Services',
      p(`The Platform may contain links, integrations or references to third-party websites, applications, payment services, Service Providers and other services.`),
      p(`Near G Fix is not responsible for the privacy practices of third parties that operate independently of Near G Fix.`),
      p(`You should review the privacy policies and terms applicable to third-party services before providing personal information to them.`),
    ),
    sec('22', 'Dispute Resolution and Jurisdiction',
      p(`In the event of any dispute, difference or claim arising out of or relating to these Terms or the use of the Platform, the Customer shall first raise the matter with the **Near G Fix Customer Support Team** through the contact details provided in **Clause 23**. Near G Fix will make reasonable efforts to review and resolve the matter through its customer support and grievance-resolution process.`),
      p(`If the matter is not resolved through the Customer Support Team, the parties shall endeavour to resolve the dispute amicably through mutual discussions within **thirty (30) days** from the date on which the dispute is formally raised.`),
      p(`If the dispute remains unresolved, any dispute that is legally capable of being referred to arbitration may be referred to and finally resolved by arbitration in accordance with the **Arbitration and Conciliation Act, 1996**, as amended from time to time. The arbitration shall be conducted by a sole arbitrator mutually appointed by the parties in accordance with applicable law. The **seat and venue of arbitration shall be Cuddalore, Tamil Nadu, India**, and the proceedings shall be conducted in English/Tamil.`),
      p(`The arbitral award shall be final and binding on the parties, subject to applicable law. Matters that are not legally capable of being referred to arbitration, or that require the intervention of any governmental, regulatory, statutory or law-enforcement authority, shall be dealt with by the competent authority or court in accordance with applicable law.`),
      p(`Nothing in this Clause shall restrict or exclude any mandatory rights, remedies or statutory forums available to a Customer under applicable law.`),
      p(`Subject to applicable law, the competent courts at **Cuddalore, Tamil Nadu, India** shall have jurisdiction over matters arising out of or relating to these Terms that are not subject to arbitration.`),
    ),
    sec('23', 'Contact Us',
      p(`For questions regarding this Privacy Policy or Near G Fix's privacy practices, please contact:`),
      p(`**Globogreen System and Technology Pvt. Ltd.**
**Trading/Brand Name:** Near G Fix
**Registered Office:** No. 1/16, South Street, Villiyanallur, Bhuvanagiri Taluk, Tamil Nadu, India
**Website:** neargfix.com
**Privacy/Grievance Email:** support@neargfix.com
**Phone:** 8124123452`),
    ),
    sec('24', 'Changes to This Privacy Policy',
      p(`Near G Fix may update this Privacy Policy from time to time to reflect:`),
      ul(`changes in the Platform;
        new services;
        changes in technology;
        changes in legal or regulatory requirements;
        changes in data-processing practices; or
        other operational requirements.`),
      p(`The updated Privacy Policy will be published on the Platform with a revised "Last Updated" date.`),
      p(`Where required by applicable law, Near G Fix may provide additional notice or obtain consent for material changes.`),
      p(`Your continued use of the Platform after the effective date of an updated Privacy Policy may constitute acknowledgement of the updated policy to the extent permitted by applicable law.`),
    ),
  ],
};

export const LEGAL_DOCS = { [TERMS.type]: TERMS, [PRIVACY.type]: PRIVACY };

// Versions the user must have accepted; compared against the backend record.
export const CURRENT_LEGAL_VERSIONS = {
  [TERMS.type]: TERMS.version,
  [PRIVACY.type]: PRIVACY.version,
};
