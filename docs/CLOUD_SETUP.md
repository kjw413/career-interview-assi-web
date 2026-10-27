# Vercel + Supabase 연결

코드는 클라우드 모드를 지원하지만, 실제 Supabase에 SQL과 로그인 설정을 적용하고 Vercel에 공개 환경변수를 등록해야 동작합니다. 코드 배포와 프로젝트 설정은 별개입니다.

대상 서비스:

- 앱: https://career-interview-assi-web.vercel.app/
- Supabase: https://wcimjoetacfshekeopdo.supabase.co

## 1. Supabase SQL 적용

Supabase 대시보드에서 해당 프로젝트를 열고 **SQL Editor → New query**를 선택합니다.

[초기 설정 SQL](../supabase/migrations/202610270001_folio_cloud.sql)의 전체 내용을 복사해 실행합니다. `Success`로 완료되는지 확인합니다. 이 SQL은 재실행할 수 있습니다.

생성되는 항목:

- `public.folio_projects`: 로그인 계정별 지원서와 질문 트리
- `save_folio_project`: 버전 검사 후 저장하는 함수
- `resumes`: 비공개 PDF 버킷, 20MB 제한
- RLS 정책: 로그인한 본인만 본인 자료에 접근

PDF 버킷을 Public으로 바꾸지 마세요. 로그인·RLS 없이 전체 데이터 접근을 허용하는 정책도 추가하지 않습니다.

## 2. Supabase 로그인 설정

**Authentication → URL Configuration**에서 설정합니다.

- Site URL: `https://career-interview-assi-web.vercel.app`
- Redirect URLs: `https://career-interview-assi-web.vercel.app/`

**Authentication → Sign In / Providers**에서 Email 로그인이 활성화되어 있는지 확인합니다. 이메일 확인을 사용하는 경우 가입 후 확인 메일의 링크를 눌러야 로그인할 수 있습니다. 이메일 전송 한도가 걸리면 잠시 뒤 다시 시도하세요.

혼자만 사용하려면 본인 계정 생성·확인 후 신규 가입 허용을 끌 수 있습니다. 기존 계정 로그인은 계속 사용할 수 있습니다.

## 3. Vercel 환경변수

프로젝트 **Settings → Environment Variables**에 아래 두 항목을 **Config**, **Production**으로 등록합니다.

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://wcimjoetacfshekeopdo.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase API Keys 화면의 `sb_publishable_…` 공개 키 |

구형 프로젝트의 `anon` 키도 지원합니다. `service_role`, Secret Key, DB 비밀번호는 브라우저용 `VITE_` 변수에 넣지 않습니다. 환경변수 이름은 `.env.example`에도 정리되어 있습니다.

이 두 값은 브라우저에 공개되는 연결 설정입니다. 자료 접근은 로그인과 RLS로 보호합니다. Vercel에서 Secret 유형과 `VITE_` 접두사 충돌 안내가 나오면 Config를 선택합니다.

이후 **Deployments → 최신 배포 → Redeploy**로 환경변수를 반영합니다. GitHub에 새 코드가 푸시되면 연결된 Vercel 프로젝트가 자동 배포할 수도 있습니다. 해당 배포가 최신 커밋과 환경변수를 사용하는지 확인합니다.

## 4. 로그인과 기존 자료 이전

1. 앱에서 회원가입하고 이메일 확인을 완료합니다.
2. PC와 노트북에서 같은 계정으로 로그인합니다.
3. 기존 자료를 작성했던 **같은 브라우저·같은 사이트 주소**에서 로그인하면 기존 자료 가져오기 안내가 표시됩니다.
4. 가져오기를 선택하면 현재 계정으로 지원서와 PDF를 복사합니다. 샘플은 제외하고 같은 자료는 중복 복사하지 않으며, 기존 로컬 원본은 유지합니다.
5. 다른 기기에서 작성한 내용은 로그인 시 불러옵니다. 이미 열어 둔 기기에서는 **최신 내용 불러오기**를 누릅니다. 실시간 공동 편집 방식은 아닙니다.

다른 주소에서 작성한 자료는 브라우저 저장소가 분리됩니다. 이전 주소에서 JSON 백업을 내보낸 뒤 새 주소에서 불러오면 됩니다. JSON 백업에는 PDF 원본이 포함되지 않습니다.

## 저장 실패와 충돌

입력은 짧은 지연 후 자동 저장됩니다. ‘모든 변경사항 저장됨’을 확인하고 기기를 옮기세요. 실패 시 저장 실패 버튼으로 다시 시도할 수 있습니다.

두 기기에서 같은 지원서를 수정하면 오래된 버전의 덮어쓰기를 막습니다. 최신 내용을 불러올 때 미저장 지원서의 백업을 내려받고 클라우드 최신 내용을 불러옵니다. 백업 불러오기로 별도 지원서에 복구할 수 있습니다.

네트워크 저장 전에 계정별 복구 사본도 브라우저에 기록합니다. 실패 후 다시 로그인하면 복구 백업을 내려받을 수 있습니다. 복구 사본을 자동으로 클라우드에 덮어쓰지 않습니다. 브라우저 저장소가 차단되거나 삭제되면 이 사본은 유지되지 않으므로 별도 JSON/PDF 백업을 보관하세요.

## 개발·테스트

- 환경변수가 모두 없으면 기존 로컬 모드로 실행합니다.
- 한 항목만 있거나 서버용 키를 넣으면 설정 오류를 표시합니다.
- 클라우드 로그인·요청 실패 시 로컬 저장으로 몰래 전환하지 않습니다.
- 로컬 개발에서는 `.env.example`을 `.env.local`로 복사해 공개 키를 채우고, 개발 주소를 Supabase Redirect URLs에 별도 등록합니다.
- `npm test`: 로컬 저장·백업, 클라우드 설정·복구, 실제 PostgreSQL WASM에서 마이그레이션·RLS·충돌 검사
- `npm run test:e2e`: 클라우드 설정과 분리된 로컬 모드의 PDF/OCR·질문 트리 테스트
- `npm run test:e2e:cloud`: 모의 Supabase HTTP 응답을 사용한 로그인, 독립 브라우저 간 데이터 공유, 계정 분리, 충돌, 자료 이전과 복구 테스트

자동화 테스트는 실제 운영 Supabase 계정·설정이 적용되었다는 증거를 대신하지 않습니다. 운영 프로젝트의 초기 설정 후 PC와 노트북에서 같은 계정으로 로그인해 질문·답변 작성과 PDF 원본 다운로드까지 확인합니다.
