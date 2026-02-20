# -*- coding: utf-8 -*-
"""Module categorisation for distributed scan workers (Phase 11).

Modules are split into two queues:
  - scans.fast  — quick, low-resource modules (default)
  - scans.slow  — slow, resource-heavy, or heavily rate-limited modules

Workers subscribed to the slow queue can be scaled independently so that
brute-force / crawl / API-heavy modules never starve fast reconnaissance.
"""

# Modules that belong on the slow queue.  Any scan whose module list
# contains at least one slow module is routed to scans.slow.
SLOW_MODULES: set[str] = {
    # Port scanning
    'sfp_portscan_tcp',
    # SSL/TLS enumeration (can be slow on large nets)
    'sfp_sslcert',
    # Web crawl / spider
    'sfp_spider',
    'sfp_crawler',
    'sfp_webanalyzer',
    # Heavily rate-limited / paid API modules
    'sfp_shodan',
    'sfp_virustotal',
    'sfp_censys',
    'sfp_passivetotal',
    'sfp_ipstack',
    'sfp_hackertarget',
    # Brute-force modules
    'sfp_bruteforce',
    'sfp_dns_brute',
}


def classify_modules(module_list: str) -> str:
    """Return the queue type for a comma-separated list of module names.

    Args:
        module_list: Comma-separated module names, e.g. "sfp_dns,sfp_shodan"

    Returns:
        'slow' if any module in the list is in SLOW_MODULES, else 'fast'
    """
    if not module_list:
        return 'fast'
    mods = {m.strip() for m in module_list.split(',') if m.strip()}
    return 'slow' if mods & SLOW_MODULES else 'fast'
