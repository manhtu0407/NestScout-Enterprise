# NestScout Horizon

**Hiểu đúng nhu cầu. An tâm từ đầu.**

![NestScout Horizon logo on a light background](docs/assets/nestscout-horizon-logo-light.png)

NestScout Horizon is a home-services product in development, starting with
apartment residents in Ho Chi Minh City, Vietnam, who need help understanding
a problem at home, choosing suitable professionals and agreeing on clear pricing.

> **Development status: engineering foundation, pre-application.** The planned
> experience below is not yet available as a working product.

## Why we exist

Something at home feels wrong, but knowing what to book is another matter.
Rigid service categories can miss the problem. Provider information is scattered,
trust is difficult to assess, and an unclear quote leaves people unsure what
they are agreeing to.

The founder's starting point was frustration with asking for the right home
service, finding trustworthy help and judging reasonable, transparent pricing.
The aim is straightforward: help people understand their needs and make informed
choices before work begins.

We are building toward an AI-assisted experience where customers describe their
needs naturally, compare understandable options and work with suitable service
professionals while keeping control of decisions. The intended emotional journey
is to feel understood, informed, reassured and confident enough to return.
That is a brand intention, not a measured customer outcome.

## People and planned services

The initial focus is apartment residents in Ho Chi Minh City. The experience is
being planned around three groups:

- Customers who need help explaining a problem and understanding their options.
- Service professionals, or workers, who need clear requests, agreed scope and
  a record of completed work.
- Human service operators who would help resolve uncertainty and support cases
  that need judgment. Operator and admin interfaces remain future direction.

The six planned service groups are home cleaning; electrical repair; plumbing
repair; air-conditioning; sofa, mattress, curtain and carpet care; and minor
repair or installation. These are intended categories, not live service listings.

## The planned customer journey

This is the intended experience, subject to detailed workflow design:

1. Describe the request in everyday language.
2. Clarify needs with Kael, including what remains uncertain.
3. Consider understandable service options and, where evidence supports them,
   price estimates with a clear basis and limitations.
4. Confirm the next step and proposed worker before an assignment proceeds.
5. Follow understandable progress and approve explained scope or price changes
   before additional work proceeds.
6. Receive clear completion records and a route to human support if questions
   or disputes remain.

## Kael's planned role

Kael Service Operator is the planned AI service operator for interpreting needs
and supporting coordination. It is not deployed, and no Kael runtime is present
in this repository. Detailed workflows, tools and permissions remain pending.

The design requires Kael to acknowledge missing evidence and never invent prices
or worker availability. Consequential actions would require human approval and
backend authorization. These are requirements for implementation, not safeguards
already operating in a live service.

## Trust, transparency and control

The product should make uncertainty visible, explain what a quote covers and
keep customers involved when circumstances change. It should distinguish an
estimate from an agreed price and make consent understandable.

Worker ratings, prices, availability and service metrics must come from real
evidence. We do not promise that every worker is verified or every price is
guaranteed. Accountable service history, including agreed changes and completion
records, is an intended foundation for support and dispute resolution.

## A sustainable service business

The proposed business model is a platform fee on successfully completed service
work. Its value should come from reducing confusion and helping both sides reach
a clear agreement.

The longer-term ambition is to serve more of Vietnam and potentially Asia.
Expansion would depend on earned trust and service quality in the initial market.

## Current repository and technical direction

The repository remains `manhtu0407/NestScout-Enterprise`. It currently contains
Node.js 24/npm engineering tooling, local Supabase development tooling, generated
database types and tests, repository verification, security and governance checks,
and documentation. It does not yet include a product app, deployed mobile product,
live bookings, production payments or a Kael runtime.

Expo/React Native, TypeScript and Supabase are the confirmed technical direction,
with iOS first. Application structure, detailed workflows and release setup are
still pending; this is not evidence of Android or TestFlight readiness.

## Explore the project

- [Architecture and product direction](docs/architecture.md)
- [Developer setup and tooling](docs/development-guide.md)
- [Contributing and engineering questions](CONTRIBUTING.md)
- [Private security reporting](SECURITY.md)
- [Engineering policy for coding agents](AGENTS.md)

## Visibility and licensing

This repository is publicly visible, but no software license has been selected.
Visibility alone does not grant permission to reuse or redistribute its contents.
