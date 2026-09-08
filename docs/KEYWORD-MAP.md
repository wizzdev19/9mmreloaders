# Keyword map

One primary keyword per URL. This file exists so that two pages never chase the same
search term, which is the thing that splits link equity and leaves both pages ranking
lower than one page would have done.

`scripts/check-cannibalisation.js` reads the live site and fails if two indexable URLs
claim the same primary term, or if two indexable URLs ship the same title tag or the
same H1. Run it with `npm run audit:cannibal`.

Honesty note: no search volume or difficulty figure appears in this file. The client's
keyword tool was unavailable, so every term below was selected from the catalogue data
and from manual result inspection. Verify volume and difficulty in the tool before any
of these are used to set targets.

## Rules applied

1. A term belongs to exactly one URL. Every other page that mentions it links to that URL.
2. Model collections own `glock <model> for sale`. Nothing else may use that phrase in a title or H1.
3. Caliber pages own `<caliber> glock`. They are a cross model cut and never claim a model term.
4. The catalogue hub owns the generic head term. Collections never repeat it.
5. A non model collection holding fewer than three listings is `noindex, follow`. It stays crawlable and linked, but it cannot compete with the larger page that contains the same items. Currently that is `glock-store-models` (1) and `used-glock-pistols` (1).
6. Model collections are exempt from rule 5. A single Glock 39 listing is still the only answer to a search for a Glock 39, so a thin model page is a real answer rather than a duplicate.
7. Product pages own `<full product name> <sku>`. Where 158 products share a supplier name, the SKU is what makes the title and the H1 unique.

## Head and hub pages

| URL | Primary keyword | Angle that keeps it distinct | Indexable |
| --- | --- | --- | --- |
| `/` | glock retailer texas | Brand and entry point. Links out, ranks for the business itself. | yes |
| `/glock-pistols-for-sale` | glock pistols for sale | The complete index across every model, finish and caliber. | yes |
| `/models` | glock models list | A directory of model collections, not a product listing. | yes |
| `/calibers` | glock calibers | A directory of caliber cuts, not a product listing. | yes |

## Model collections

| URL pattern | Primary keyword | Notes |
| --- | --- | --- |
| `/collections/glock-17-for-sale` | glock 17 for sale | One row per model. 30 model collections in total, covering 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 47, 48, 49. |
| `/collections/glock-19-for-sale` | glock 19 for sale | Largest single intent in the set. Verify in tool. |
| `/collections/glock-43-for-sale` | glock 43 for sale | 67 listings, the deepest inventory the shop holds. |

Secondary terms a model page may target inside its body copy, never in the title:
`glock <model> price`, `glock <model> <caliber>`, `glock <model> gen 5`.

## Range collections

| URL | Primary keyword | Angle |
| --- | --- | --- |
| `/collections/glock-factory-handguns` | factory glock handguns | Unmodified, as it leaves the factory. Explicitly not custom, not colored. |
| `/collections/glock-factory-colored-handguns` | colored glock pistols | Factory applied color finish rather than standard black. |
| `/collections/custom-glocks` | custom glock builds | Aftermarket slide cuts, coatings and grip work. |
| `/collections/optic-ready-glocks` | optic ready glock | Slide already cut for a red dot, or optic fitted. |
| `/collections/gen-6-glocks` | gen 6 glock | Generation, not model. |
| `/collections/used-glock-pistols` | used glock pistols | One listing. `noindex, follow` until it holds three or more. |
| `/collections/glock-store-models` | glock store exclusive | One listing. `noindex, follow` until it holds three or more. |

## Parts collections

| URL | Primary keyword | Angle |
| --- | --- | --- |
| `/collections/glock-slides` | glock slides | Sold as a part, not a firearm, so it ships direct. |
| `/collections/glock-triggers` | glock triggers | Drop in trigger assemblies and shoes. |

## Caliber pages

| URL | Primary keyword | Listings |
| --- | --- | --- |
| `/calibers/9mm` | 9mm glock pistols | 185 |
| `/calibers/40-sw` | 40 sw glock | 42 |
| `/calibers/380-acp` | 380 acp glock | 32 |
| `/calibers/45-acp` | 45 acp glock | 24 |
| `/calibers/10mm-auto` | 10mm glock | 17 |
| `/calibers/22-lr` | 22 lr glock | 11 |
| `/calibers/357-sig` | 357 sig glock | 8 |

## The three way overlap that needed fixing

`/glock-pistols-for-sale` (379 listings), `/collections/glock-factory-handguns` (111) and
`/calibers/9mm` (185) all contain many of the same products. They are kept apart by angle
rather than by inventory:

- the hub is the complete index and says so in the H1, the intro and the description,
- the factory collection is about the configuration being unmodified,
- the caliber page is a cross model comparison in one chambering.

None of the three uses another's primary phrase in its title or H1.

## Pages deliberately kept out of the index

| URL | Directive | Reason |
| --- | --- | --- |
| `/search` and any `?q=` | `noindex, follow` | Internal search results. Google asks that these are not indexed. |
| any `?sort=` permutation | `noindex, follow` | Same set of products in a different order. |
| `/cart`, `/order-request` | `noindex, follow` | Session state, no search value. |
| `/contact/received`, `/order-request/received` | `noindex, nofollow` | Confirmation pages reachable only after a POST. |
| thin non model collections | `noindex, follow` | Rule 5 above. |
| `/404` responses | `noindex, follow` | Status code already tells a crawler to drop the URL. |

## Not targeted, and why

`bulk ammo`, `ammo for sale`, `cheap guns online`: the results are held by national
aggregators with far more domain history. Chasing them from a new domain wastes effort.
Revisit once the model pages hold positions.

`glock for sale near me`: needs a physical address, opening hours and a Google Business
Profile. The address is not yet supplied, so the local pack cannot be entered. This is
the highest value item still blocked on client information.
