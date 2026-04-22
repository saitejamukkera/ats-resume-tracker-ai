# Graph Report - C:\Users\mukke\Desktop\Job-Resume-Tracker  (2026-04-18)

## Corpus Check
- 116 files · ~60,455 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 425 nodes · 608 edges · 72 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 159 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]

## God Nodes (most connected - your core abstractions)
1. `runPipeline()` - 23 edges
2. `AuthController` - 14 edges
3. `ResumeController` - 13 edges
4. `callLLM()` - 11 edges
5. `PipelineTelemetry` - 11 edges
6. `JobApplicationService` - 9 edges
7. `ResumeService` - 9 edges
8. `analyzeBullet()` - 9 edges
9. `SnapshotStore` - 9 edges
10. `extractTechProfile()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `profileRoleImpact()` --calls--> `runPipeline()`  [INFERRED]
  C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\impact\detector.ts → C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\pipeline\runner.ts
- `analyzeBullet()` --calls--> `repairBullets()`  [INFERRED]
  C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\impact\detector.ts → C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\validation\repair.ts
- `analyzeBullet()` --calls--> `repairKeywordGaps()`  [INFERRED]
  C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\impact\detector.ts → C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\stages\keyword-gap-repair.ts
- `runPipeline()` --calls--> `parseLatexResume()`  [INFERRED]
  C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\pipeline\runner.ts → C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\stages\latex-assembler.ts
- `runPipeline()` --calls--> `extractTechProfile()`  [INFERRED]
  C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\pipeline\runner.ts → C:\Users\mukke\Desktop\Job-Resume-Tracker\resume-pipeline\src\stages\tech-stack-extractor.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (15): AuthService, GeminiService, JobApplicationController, checkBaseResumes(), handleGenerate(), PromptBuilder, ResumeBaseRepository, ResumeController (+7 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (26): calculateATSScore(), extractAllText(), stripLatexCommands(), generateCoverLetter(), classifyError(), parseJD(), extractBoldKeywords(), repairKeywordGaps() (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (8): AuthController, handleResendOtp(), handleSendSignupOtp(), AuthUserRepository, confirmLogout(), EmailService, OAuth2SuccessHandler, OtpService

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (6): confirmDelete(), async(), confirmDelete(), handleStatusChange(), JobApplicationRepository, JobApplicationService

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (6): handleForgotSendOtp(), handleLogin(), handleResetPassword(), handleVerifyAndRegister(), resetForm(), RedirectController

### Community 5 - "Community 5"
Cohesion: 0.19
Nodes (3): CustomUserDetailsService, JwtAuthenticationFilter, JwtUtil

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (6): handleSave(), clearStorage(), handleRegenerate(), handleSaveApp(), handleUpdatePreview(), handleSave()

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (10): assembleLatex(), boldifyKeywords(), boldifyMetrics(), escapeLatex(), extractNamedSection(), findSectionBoundaries(), parseExperienceRoles(), parseLatexResume() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.36
Nodes (9): analyzeBullet(), checkCredibility(), classifyStrength(), detectCategory(), detectSignals(), detectTech(), generateSuggestion(), profileRoleImpact() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.46
Nodes (6): apiFetch(), attemptRefresh(), emitSessionExpired(), ensureFreshToken(), silentRefresh(), tokenExpiresWithin()

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (1): SnapshotStore

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (1): WordDocumentService

### Community 12 - "Community 12"
Cohesion: 0.71
Nodes (6): extractFromProjectHeadings(), extractFromSkillsSection(), extractTechProfile(), isWordBoundary(), scanTextForTechs(), stripLatex()

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (1): SecurityConfig

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (2): useAuth(), OAuthCallbackContent()

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (2): useThemeContext(), useTheme()

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (2): useToast(), useDownloader()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (1): ATSJobTrackerApplication

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): Trigger(), useDropdown()

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.83
Nodes (3): buildHealthReport(), emptyReport(), percentile()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (1): GeminiApiException

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): NotAuthenticatedException

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (1): UserNotFoundException

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (1): AuthUser

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (1): JobApplication

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (1): PromptConstants

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): ATSJobTrackerApplicationTests

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): getCompanyInitials(), getFormattedFilename()

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (1): AuthResponse

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): GenerateFromJdRequest

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (1): GenerateFromJdResponse

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (1): JobApplicationRequest

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): JobApplicationResponse

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): LoginRequest

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): RegisterRequest

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): ResumeGenerationRequest

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (1): ResumeGenerationResponse

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (1): SendOtpRequest

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (1): UpdateContentRequest

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (1): VerifyOtpRegisterRequest

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): ResumeBase

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): UserProfile

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **15 isolated node(s):** `AuthResponse`, `GenerateFromJdRequest`, `GenerateFromJdResponse`, `JobApplicationRequest`, `JobApplicationResponse` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 30`** (2 nodes): `AuthResponse`, `AuthResponse.java`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `GenerateFromJdRequest.java`, `GenerateFromJdRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `GenerateFromJdResponse.java`, `GenerateFromJdResponse`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `JobApplicationRequest.java`, `JobApplicationRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `JobApplicationResponse.java`, `JobApplicationResponse`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `LoginRequest.java`, `LoginRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `RegisterRequest.java`, `RegisterRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `ResumeGenerationRequest.java`, `ResumeGenerationRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `ResumeGenerationResponse.java`, `ResumeGenerationResponse`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `SendOtpRequest.java`, `SendOtpRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `UpdateContentRequest.java`, `UpdateContentRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `VerifyOtpRegisterRequest.java`, `VerifyOtpRegisterRequest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `ResumeBase.java`, `ResumeBase`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `UserProfile.java`, `UserProfile`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `page.tsx`, `Home()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `layout.tsx`, `ProtectedLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `loading.tsx`, `ProtectedLoading()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `page.tsx`, `ApplicationDetail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `page.tsx`, `Dashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `page.tsx`, `NewApplication()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `page.tsx`, `Settings()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `page.tsx`, `LoginPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `page.tsx`, `RegisterPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (2 nodes): `ConfirmModal.tsx`, `ConfirmModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (2 nodes): `DownloadDropdown.tsx`, `handleDownload()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (2 nodes): `LandingPage.tsx`, `handleScroll()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `Providers.tsx`, `Providers()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (2 nodes): `SessionExpiredModal.tsx`, `SessionExpiredModal()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `StatusDropdown.tsx`, `StatusDropdown()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (2 nodes): `getStatusConfig()`, `ApplicationHeader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (2 nodes): `JobDescriptionCard.tsx`, `JobDescriptionCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `Drawer.tsx`, `handleEsc()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `ApplicationStatus.java`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `AuthProvider.java`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `PdfPreview.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `dtos.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `inspect_latex.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runPipeline()` connect `Community 1` to `Community 0`, `Community 7`, `Community 8`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Why does `JobApplicationController` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `ResumeController` connect `Community 0` to `Community 11`, `Community 6`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `runPipeline()` (e.g. with `.getTraceId()` and `.startStage()`) actually correct?**
  _`runPipeline()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `callLLM()` (e.g. with `.capture()` and `generateCoverLetter()`) actually correct?**
  _`callLLM()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AuthResponse`, `GenerateFromJdRequest`, `GenerateFromJdResponse` to the rest of the system?**
  _15 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._