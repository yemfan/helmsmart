import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — HelmSmart",
  description: "HelmSmart's terms of service and user agreement.",
};

export default function TermsPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Last updated: June 8, 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="prose prose-sm max-w-none space-y-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing and using HelmSmart, a DBA of MAXY Investment Inc ("Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. License Grant</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart grants you a non-exclusive, non-transferable, revocable license to access and use HelmSmart strictly in accordance with these Terms of Service. You may not copy, modify, or distribute the Service or its content without express written permission from HelmSmart.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. User Responsibilities</h2>
            <p className="text-gray-600 leading-relaxed mb-3">You agree that you will:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Use HelmSmart only for lawful purposes and in a way that does not infringe upon the rights of others</li>
              <li>Maintain the confidentiality of your account credentials</li>
              <li>Notify HelmSmart immediately of any unauthorized use of your account</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not engage in harassment, abuse, or spam</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Intellectual Property Rights</h2>
            <p className="text-gray-600 leading-relaxed">
              The Service and its entire contents, features, and functionality (including but not limited to all information, software, text, displays, images, video, and audio) are owned by HelmSmart, its licensors, or other providers of such material and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Payment Terms</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              If you subscribe to a paid plan, you agree to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>Pay all charges that you incur</li>
              <li>Pay any applicable taxes</li>
              <li>Authorize HelmSmart to charge your payment method automatically for each renewal term</li>
              <li>Give us advance notice if you wish to cancel your subscription</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart and its team members, affiliates, licensors, and service providers will not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Service, even if we have been advised of the possibility of such damages.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Warranty Disclaimer</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, expressed or implied, regarding the Service. To the fullest extent permissible by law, HelmSmart disclaims all warranties, express or implied, including but not limited to implied warranties of merchantability and fitness for a particular purpose.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Refund Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart offers a 30-day money-back guarantee on all paid plans. If you are not satisfied with the Service for any reason, contact us within 30 days of your first charge for a full refund.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Termination</h2>
            <p className="text-gray-600 leading-relaxed">
              We may terminate or suspend your account and access to HelmSmart immediately, without prior notice or liability, for any reason whatsoever, including if you breach the Terms.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. SMS / Text Messaging Program</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              If you provide your mobile phone number and opt in, you consent to receive text messages from HelmSmart (a DBA of MAXY Investment Inc) and, where applicable, from businesses that use the HelmSmart platform to communicate with their own customers. The terms of our SMS program are:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li><strong>Program description:</strong> recurring messages such as appointment reminders and confirmations, follow-ups to prior conversations, account and document notifications, and replies to your inquiries.</li>
              <li><strong>Message frequency:</strong> message frequency varies based on your interactions.</li>
              <li><strong>Cost:</strong> message and data rates may apply.</li>
              <li><strong>Opt-out:</strong> reply <strong>STOP</strong> at any time to unsubscribe. You will receive a confirmation and no further messages.</li>
              <li><strong>Help:</strong> reply <strong>HELP</strong> for assistance, or contact us at contact@helmsmart.ai.</li>
              <li>Consent to receive text messages is not a condition of any purchase. Carriers are not liable for delayed or undelivered messages.</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Mobile opt-in information and consent are never shared with third parties or affiliates for marketing or promotional purposes. See our{" "}
              <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700">Privacy Policy</Link> for details.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Related Products</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart is built by the same team behind <Link href="https://leadsmart-ai.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700 font-medium">LeadSmart AI</Link>, another AI-powered business platform. Both products share similar terms of service standards and are committed to the same level of quality and support.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              HelmSmart reserves the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Contact Us</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <p className="text-gray-600 mt-3">
              <strong>Email:</strong> legal@helmsmart.ai<br />
              <strong>Web:</strong> <Link href="/contact" className="text-indigo-600 hover:text-indigo-700">helmsmart.ai/contact</Link>
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            For more information about HelmSmart's privacy practices, please see our{" "}
            <Link href="/privacy" className="text-indigo-600 hover:text-indigo-700">
              Privacy Policy
            </Link>
            . Both HelmSmart and our sibling product{" "}
            <Link href="https://leadsmart-ai.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-700">
              LeadSmart AI
            </Link>
            {" "}follow the same commitment to transparency and user rights.
          </p>
        </div>
      </section>
    </div>
  );
}
