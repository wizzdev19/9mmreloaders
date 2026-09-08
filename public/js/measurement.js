/* =========================================================================
   Measurement loader stub.

   This file is requested only after a visitor presses "Allow measurement
   cookies" AND an ANALYTICS_MEASUREMENT_ID is set in the environment. It is
   intentionally empty of any third party code.

   To connect a real analytics product later:
     1. Decide whether the vendor is acceptable under the privacy policy, and
        add it to the processor list on /privacy-policy.
     2. Add the vendor origin to the CSP script-src and connect-src directives
        in src/security.js. The policy currently allows scripts from this origin
        only, which is what stops a tag being dropped in without review.
     3. Load the vendor snippet from inside the guard below so it still cannot
        run before consent.
     4. Add the vendor's cookies to the table on /cookie-policy.

   Nothing is loaded until all four steps are done on purpose.
   ========================================================================= */
(function () {
  'use strict';
  var self = document.getElementById('measurement-script');
  var measurementId = self ? self.getAttribute('data-id') : null;
  if (!measurementId) return;
  // No vendor connected yet. See the notes above before adding one.
})();
