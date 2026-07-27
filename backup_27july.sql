--
-- PostgreSQL database dump
--

\restrict fIqWNmH2OgQRencfkC6CkUKXzvnR9wLJgLzveYDf25tR2axCRuVuTYZi1Pkd72Y

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-07-27 16:59:49

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16389)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 4992 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 220 (class 1259 OID 16400)
-- Name: api_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_logs (
    log_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    submission_id uuid,
    section_key character varying(50),
    model_name character varying(100),
    prompt_sent text,
    response_received text,
    tokens_used integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.api_logs OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16408)
-- Name: forms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.forms (
    form_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    form_name character varying(255) NOT NULL,
    category character varying(100),
    is_active boolean DEFAULT true
);


ALTER TABLE public.forms OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 16415)
-- Name: questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.questions (
    question_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    section_id uuid NOT NULL,
    v_code character varying(20) NOT NULL,
    variable_name character varying(100),
    question_text_fa text NOT NULL,
    response_type character varying(50) NOT NULL,
    coding_options jsonb,
    unit character varying(50),
    manual_prompt text,
    is_required boolean DEFAULT true,
    sort_order integer DEFAULT 0
);


ALTER TABLE public.questions OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 16428)
-- Name: responses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.responses (
    response_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    submission_id uuid,
    question_id uuid NOT NULL,
    v_code character varying(20),
    is_voice boolean DEFAULT true,
    transcript text,
    extracted_value text,
    extracted_value_json jsonb,
    ai_confidence double precision,
    processed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.responses OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16438)
-- Name: sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sections (
    section_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    form_id uuid NOT NULL,
    section_key character varying(50) NOT NULL,
    name_fa character varying(255) NOT NULL,
    sort_order integer DEFAULT 0,
    depends_on_vcode character varying(20),
    depends_on_value text,
    skip_if_vcode character varying(20),
    skip_if_value text
);


ALTER TABLE public.sections OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 16449)
-- Name: submissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.submissions (
    submission_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    form_id uuid NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.submissions OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 16459)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    national_code character varying(20) NOT NULL,
    phone_number character varying(20),
    role integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 4980 (class 0 OID 16400)
-- Dependencies: 220
-- Data for Name: api_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.api_logs (log_id, submission_id, section_key, model_name, prompt_sent, response_received, tokens_used, created_at) FROM stdin;
\.


--
-- TOC entry 4981 (class 0 OID 16408)
-- Dependencies: 221
-- Data for Name: forms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.forms (form_id, form_name, category, is_active) FROM stdin;
f47ac10b-58cc-4372-a567-0e02b2c3d479	پرسشنامه جامع کوهورت پارسیان	Full Research	t
\.


--
-- TOC entry 4982 (class 0 OID 16415)
-- Dependencies: 222
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.questions (question_id, section_id, v_code, variable_name, question_text_fa, response_type, coding_options, unit, manual_prompt, is_required, sort_order) FROM stdin;
e5f12222-25e3-411a-b00b-df218da4800c	11111111-1111-1111-1111-111111111111	A2	EnrollmentDate	تاریخ ثبت‌نام:	Date	\N	\N		t	1
f7d49ffe-b38c-4106-b312-a088021610bb	11111111-1111-1111-1111-111111111111	A4	GenderID	جنسیت شما چیست؟	Categorical	{"1": "مرد", "2": "زن"}	\N		t	3
2452c661-d7b0-449c-b195-fd5c2535cfd4	11111111-1111-1111-1111-111111111111	A5	BirthDate	تاریخ تولد (طبق شناسنامه):	Date	\N	\N		t	4
709f2980-dd13-4e1b-9d5e-e085a6c859d1	11111111-1111-1111-1111-111111111111	A26	MarriageNo	تعداد ازدواج:	Discrete	\N	بار		f	11
ccf0fe34-fa22-4d65-bd6f-1e80ee01a23c	11111111-1111-1111-1111-111111111111	A24	MaritalStatusID	وضعیت تأهل:	Categorical	{"1": "مجرد (ازدواج نکرده)", "2": "متأهل", "3": "همسر مرحوم/بیوه", "4": "مطلقه", "5": "سایر"}	\N		t	10
36f4c04c-d5f0-4753-8df4-3b3a80a5b10a	11111111-1111-1111-1111-111111111111	A28	FamilyMarriageID	آیا ازدواج فامیلی بوده است؟	Categorical	{"1": "بله، فامیل درجه یک", "2": "خیر", "3": "بله، فامیل درجه دو"}	\N		f	13
561e862a-6dc8-41fc-afef-917e5e54fdea	11111111-1111-1111-1111-111111111111	A30	ResidenceType	نوع محل سکونت:	Categorical	{"1": "شهری", "2": "روستایی"}	\N		t	14
1d5c328a-da28-4835-9e42-75f7e6a6f5e5	22222222-2222-2222-2222-222222222222	C1	HousingStatusID	وضعیت تملک مسکن:	Categorical	{"1": "ملک شخصی", "2": "ملک رهنی یا استیجاری", "3": "ملک سازمانی", "4": "ملک خویشاوندان (امانتی)"}	\N		t	1
5fa647ba-098b-4c8a-ac2f-7b0c5066e747	22222222-2222-2222-2222-222222222222	C4	FamilyNo	تعداد افرادی که با هم در منزل زندگی می‌کنید:	Discrete	\N	نفر		t	4
5ad0d389-097e-400a-b467-b846035be505	22222222-2222-2222-2222-222222222222	C5	AccessFreezer	آیا فریزر جداگانه در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	5
624aad87-5908-43c1-9694-90c35507a002	22222222-2222-2222-2222-222222222222	C6	AccessWashingMachine	آیا ماشین لباسشویی در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	6
3154b405-c584-4a1a-9349-122e15405d2b	22222222-2222-2222-2222-222222222222	C7	AccessDishWasher	آیا ماشین ظرفشویی در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	7
73da38df-4e92-4cb5-b70f-089a836bcff6	22222222-2222-2222-2222-222222222222	C8	AccessComputer	آیا رایانه/لپ‌تاپ در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	8
bedfb7f3-db83-422f-bd7e-ccad476d954d	22222222-2222-2222-2222-222222222222	C9	AccessInternet	آیا به اینترنت دسترسی دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	9
cceb4d0f-7939-436d-8b17-48ebe0707801	22222222-2222-2222-2222-222222222222	C10	AccessMotorcycle	آیا موتورسیکلت در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	10
39549bc0-326e-4a5e-b6be-812768fe8852	22222222-2222-2222-2222-222222222222	C11	AccessCar	آیا خودرو سواری در اختیار دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	11
3f95fd53-c363-4da1-9e25-c017bd6db7ec	22222222-2222-2222-2222-222222222222	C12	CarPriceID	قیمت خودرو:	Categorical	{"1": "کمتر از ۲۰ میلیون تومان", "2": "۲۰-۵۰ میلیون تومان", "3": "۵۰-۱۰۰ میلیون تومان", "4": "بیشتر از ۱۰۰ میلیون تومان"}	\N		f	12
aaa92a21-2ced-475a-aaff-ec81cb7f6e11	22222222-2222-2222-2222-222222222222	C24	ForeignTravelNo	تعداد مسافرت‌های خارج از ایران (کل عمر):	Discrete	\N	مورد		f	14
1795b34d-6fcd-437a-aff9-551f48214882	22222222-2222-2222-2222-222222222222	C25	ForeignPilgrimageNo	تعداد مسافرت‌های زیارتی خارج از ایران:	Discrete	\N	مورد		f	15
0b9fb3f7-57df-4a0d-b55f-e1e0b293531e	22222222-2222-2222-2222-222222222222	C26	ForeignNonPilgrimageNo	تعداد مسافرت‌های غیر زیارتی خارج از ایران:	Discrete	\N	مورد		f	16
6a17ea69-bbb1-4d3e-9410-01a94bffee4b	33333333-3333-3333-3333-333333333333	E1	WaterSourceID1	منبع اصلی آب آشامیدنی شما چیست؟ (منبع اول)	Categorical	{"1": "آب چاه", "2": "آب رودخانه", "3": "آب چشمه", "4": "آب لوله کشی", "5": "آب معدنی", "6": "تانکر آب", "7": "آب انبار", "8": "سایر"}	\N		t	1
a37ad31b-5880-4d9d-a8a2-67e84bd04c11	33333333-3333-3333-3333-333333333333	E3	TapWaterAllTime	آیا همیشه از آب لوله کشی استفاده کرده‌اید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	2
ff476a8c-c56f-4fd7-9665-7ecd6454e376	33333333-3333-3333-3333-333333333333	H3	FallingSleepDurationMin	از زمانی که به رختخواب می‌روید تا خوابتان ببرد چقدر طول می‌کشد؟	Discrete	\N	دقیقه		t	6
dfdcd1df-45e5-4938-b42b-1bba7249ebe2	33333333-3333-3333-3333-333333333333	H4	MorningWakeupHour	معمولاً صبح‌ها چه ساعتی بیدار می‌شوید؟ (ساعت)	Discrete	\N	ساعت		t	7
332e4017-74ca-4e3a-9f50-5dae1963f405	33333333-3333-3333-3333-333333333333	H5	MorningWakeupMin	معمولاً صبح‌ها چه ساعتی بیدار می‌شوید؟ (دقیقه)	Discrete	\N	دقیقه		t	8
94cbbc27-39a0-4e6f-aadb-9199a7f557bc	33333333-3333-3333-3333-333333333333	H8	DayTimeNap	آیا در طول روز می‌خوابید؟ (سه بار یا بیشتر در هفته)	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	9
de4df643-4162-40bd-8945-e7a97ba2ebd4	33333333-3333-3333-3333-333333333333	H9	NapDurationMin	هر بار چند دقیقه می‌خوابید؟	Discrete	\N	دقیقه		f	10
5c72be0b-57f7-4ca3-b186-9fb3f09b2079	66666666-6666-6666-6666-666666666666	N1	DiseaseHxID	بیماری:	MultiSelect	{"1": "دیابت", "2": "فشار خون", "3": "بیماری قلبی", "4": "سکته قلبی", "5": "سکته مغزی", "6": "سرطان معده", "7": "سرطان کولورکتال", "8": "سرطان پستان", "9": "سرطان پروستات", "10": "سرطان پوست", "11": "سرطان مثانه", "12": "سرطان سیستم خونی", "13": "سرطان مری", "14": "سرطان ریه", "15": "سرطان مغز", "16": "صرع", "17": "اختلالات روانپزشکی", "18": "سردرد مزمن", "19": "آلزایمر", "20": "شکستگی لگن", "21": "سرطان حنجره", "22": "سرطان زبان", "23": "سرطان رحم", "24": "سرطان تخمدان", "25": "لوپوس", "26": "ام اس"}	\N		t	1
050c0e48-5e40-425b-bca0-58247fa5e607	33333333-3333-3333-3333-333333333333	H13	DozingOff	آیا در طول روز وقتی فعالیتی ندارید بدون اختیار چرت می‌زنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	12
311b18f0-d4c5-4ecd-9fd9-62183e932872	33333333-3333-3333-3333-333333333333	H14	SleepingPillsUse	آیا از داروهای خواب آور بطور مداوم استفاده می‌کنید؟ (بیشتر از ۲ بار در هفته)	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	13
ed3bcab7-744a-4c7e-9fc5-e3ab6d309343	33333333-3333-3333-3333-333333333333	I1	MobileUse	آیا تلفن همراه دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	14
0fdda804-54c3-4be8-a2ac-df0293f05cba	33333333-3333-3333-3333-333333333333	E4	TapWaterUseYear	چند سال است که از آب لوله کشی استفاده می‌کنید؟	Continuous	\N	سال		f	3
53fc65ce-54c2-4575-82a6-a94a283df548	33333333-3333-3333-3333-333333333333	H1	NightSleepHour	معمولاً شب‌ها چه ساعتی می‌خوابید؟ (ساعت)	Discrete	\N	ساعت		t	4
013cc007-6abd-4868-85a4-cf59710327bd	33333333-3333-3333-3333-333333333333	H2	NightSleepMin	معمولاً شب‌ها چه ساعتی می‌خوابید؟ (دقیقه)	Discrete	\N	دقیقه		t	5
eb1fbe40-7357-41f2-9680-1680d6993d32	33333333-3333-3333-3333-333333333333	I2	MobileUseDuration	چند سال است که از تلفن همراه استفاده می‌کنید؟	Continuous	\N	سال		f	15
e8529dc2-7e3b-4e28-9292-344442d3a607	33333333-3333-3333-3333-333333333333	J1	NearFarm	آیا منزل شما نزدیک مناطقی که در آن کشت و کار انجام می‌شود قرار دارد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	16
8e676101-e2b0-45a5-abbd-842fa22ecc35	33333333-3333-3333-3333-333333333333	J2	FarmDistanceID	فاصله مزرعه تا منزل:	Categorical	{"1": "دور (بیشتر از ۲۰۰ متر)", "2": "تقریباً نزدیک (۱۰۰-۲۰۰ متر)", "3": "نزدیک (۵۰-۱۰۰ متر)", "4": "خیلی نزدیک (کمتر از ۵۰ متر)"}	\N		f	17
23050b04-c7f4-48de-b417-e94d42b70516	33333333-3333-3333-3333-333333333333	J3	UseInFarm	آیا از سموم آفت‌کش در مزرعه، گلخانه یا زمین‌های کشاورزی استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	18
22936e31-b960-4215-a719-082c60d38d31	33333333-3333-3333-3333-333333333333	J35	ManageSprayingPesticide	آیا مدیریت عملیات اسپری کردن سموم را بر عهده دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	20
3013b11b-e74e-455f-b6d6-026836cd553b	55555555-5555-5555-5555-555555555555	M2	UseNo	تعداد دفعات مصرف:	Continuous	\N	\N		f	2
3d4f2c0d-1c72-4c78-9131-90af54df3806	55555555-5555-5555-5555-555555555555	M3	MedicationIntervalUsedTypeID	دفعات مصرف:	Categorical	{"1": "روزانه", "2": "هفتگی", "3": "ماهانه"}	\N		f	3
230dfb2c-b6f9-4ae9-aa6f-38eff28ac220	55555555-5555-5555-5555-555555555555	Ma1	Anti_HTN_Drug	آیا از داروهای فشار خون استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	4
6dce5766-5b9b-4385-ad6d-618bf197bd1b	55555555-5555-5555-5555-555555555555	Ma2	Anti_DM_Pills	آیا از داروهای خوراکی دیابت استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	5
cbfbc49c-1aeb-4d7f-8c10-3ee11eed6a75	55555555-5555-5555-5555-555555555555	Ma3	Insulin	آیا از انسولین استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	6
66a040dd-681d-437e-bea9-1f9a155b4f76	55555555-5555-5555-5555-555555555555	Ma4	Statins	آیا از استاتین‌ها استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	7
b2ea01ef-67c9-4533-97c8-1318b0d01b8c	66666666-6666-6666-6666-666666666666	N2	HasDisease	آیا فردی از خانواده به این بیماری مبتلا است؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌داند"}	\N		t	2
fcbb2da9-e1d7-4b00-9b86-82a28a716f01	66666666-6666-6666-6666-666666666666	N3	FamilyRelationID	نسبت فامیلی با بیمار:	Categorical	{"1": "پدر", "2": "مادر", "3": "برادر", "4": "خواهر", "5": "برادر ناتنی", "6": "خواهر ناتنی", "7": "پسر", "8": "دختر", "9": "پدربزرگ/مادربزرگ", "10": "همسر", "11": "سایر خویشاوندان درجه دو"}	\N		f	3
170d3b7a-5681-4a9f-ac29-56fb5351c565	77777777-7777-7777-7777-777777777777	O1	HasMenstruation	آیا تاکنون قاعده شده‌اید؟	Categorical	{"0": "خیر", "1": "بله"}	\N		t	1
ea619440-8cbb-4b6d-95c1-edf76f3b586a	77777777-7777-7777-7777-777777777777	O2	MenstruationStartAge	سن شروع قاعدگی:	Discrete	\N	سال		f	2
9c4871fb-f221-4cc7-8a4a-d4f239750710	77777777-7777-7777-7777-777777777777	O3	NowPregnant	آیا در حال حاضر باردار هستید؟	Categorical	{"1": "بله", "2": "خیر", "3": "نمی‌داند"}	\N		t	3
7eb3d237-e271-488e-9a10-10c12d9322dd	77777777-7777-7777-7777-777777777777	O4	PregnancyNo	تعداد حاملگی‌های قبلی:	Discrete	\N	مورد		f	4
4756e09d-c5d7-4ec1-b2e4-8e337d1ba186	77777777-7777-7777-7777-777777777777	O5	FirstPregnancyAge	سن در زمان اولین حاملگی:	Discrete	\N	سال		f	5
e51ebb91-64a1-4c62-955b-c9409d0d6021	77777777-7777-7777-7777-777777777777	O6	AliveChildbirthNo	تعداد زایمان‌های با نوزاد زنده:	Discrete	\N	مورد		f	6
dbdf9fc1-0887-461a-98e6-ff95f0c7b3ec	77777777-7777-7777-7777-777777777777	O7	FirstAliveChildbirthAge	سن در زمان اولین تولد نوزاد زنده:	Discrete	\N	سال		f	7
7f92dba2-29e3-4ed8-a2dc-75ee6d6b373f	77777777-7777-7777-7777-777777777777	O8	HasStillbirth	آیا سابقه مرده‌زایی دارید؟	Categorical	{"0": "خیر", "1": "بله"}	\N		f	8
6dfeb3df-5481-4b83-a1ae-6ea97fed4b46	77777777-7777-7777-7777-777777777777	O9	AbortionNo	تعداد سقط:	Discrete	\N	مورد		f	9
5afff858-8361-4d2b-b395-ce1ce21ac2de	77777777-7777-7777-7777-777777777777	O10	FirstAbortionAge	سن در زمان اولین سقط:	Discrete	\N	سال		f	10
e1b7f1d0-c195-46a4-b398-5c41b8e6a9d3	77777777-7777-7777-7777-777777777777	O11	BreastfeedingDuration	مجموع مدت شیردهی:	Continuous	\N	ماه		f	11
1a2426a6-8dad-49b5-94f1-ffc440cabde8	77777777-7777-7777-7777-777777777777	O12	HasInfertility	آیا سابقه نازایی دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	12
d7b439a1-d27a-418a-b434-dd01b81dc610	77777777-7777-7777-7777-777777777777	O14	OvaryRemovalTypeID	آیا سابقه برداشتن تخمدان دارید؟	Categorical	{"1": "بله، یک طرفه", "2": "بله، دو طرفه", "3": "خیر"}	\N		f	13
11eb7ede-5f3c-4bf0-b8f1-7ae33447bdc2	77777777-7777-7777-7777-777777777777	O16	HasTubectomy	آیا سابقه توبکتومی دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	14
946bfba6-adfa-474c-b154-9b1fe62b357e	77777777-7777-7777-7777-777777777777	O17	HasHysterectomy	آیا سابقه هیسترکتومی دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	15
c6603c07-41c0-41b0-b30c-20e6c0cbd4c5	77777777-7777-7777-7777-777777777777	Oa3	ContraceptionTypeID	روش پیشگیری از بارداری:	Categorical	{"1": "قرص‌های پیشگیری", "2": "ایمپلنت", "3": "تزریق پروژسترون طولانی مدت", "4": "وسایل داخل رحمی (IUD)"}	\N		f	16
85a59913-7579-4529-9199-4f647fd531b2	88888888-8888-8888-8888-888888888888	B3	WaistCircumference	دور کمر:	Continuous	\N	سانتی متر		t	3
8c525238-81fe-4039-875f-fae9f18f17bd	88888888-8888-8888-8888-888888888888	B4	HipCircumference	دور باسن:	Continuous	\N	سانتی متر		t	4
a8af94b3-c801-4aa7-9eb4-35719b016884	55555555-5555-5555-5555-555555555555	M1	MedicationID	نام دارو:	Characteristic	\N	\N		f	1
2c4d29d5-acbd-4214-b1ee-d1b3efa08f00	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G18	AerobicExercise1	پیاده‌روی سریع، ورزش آئروبیک سبک:	Continuous	\N	ساعت		t	9
ce1dae9f-42fa-40f2-9254-cd3a9ce0608e	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G21	HeavyLaborAgricultJobs1	فعالیت‌های سنگین کارگری/کشاورزی:	Continuous	\N	ساعت		t	10
4023ecf8-ae9c-45ec-8f42-55b852d8b19b	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G22	HeavyExercise1	فعالیت‌های ورزشی حرفه‌ای:	Continuous	\N	ساعت		t	11
ed1714b8-9f02-423e-9709-11847c639e13	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G23	Duration1	تعداد ماه‌هایی که این الگوی فعالیت را دارید:	Discrete	\N	ماه در سال		t	12
82148430-cdff-4faa-96fe-0a5d8542cdda	bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	H6	PreferredWakeupHour	دوست دارید صبح‌ها چه ساعتی بیدار شوید؟ (ساعت)	Discrete	\N	ساعت		t	1
c4256938-c2f2-4883-aad5-091344f28a3f	bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	H7	PreferredWakeupMin	دوست دارید صبح‌ها چه ساعتی بیدار شوید؟ (دقیقه)	Discrete	\N	دقیقه		t	2
21baa735-202a-41e9-aa5b-2eb27a40edb9	bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	H12	LegRestlessnessID	آیا در طول خواب پاهایتان زیاد حرکت می‌کند؟	Categorical	{"1": "بله", "2": "خیر", "3": "نمی‌دانم"}	\N		t	3
da3db86f-af2e-4e2a-b515-43fcf93a681c	cccccccc-cccc-cccc-cccc-cccccccccccc	Q1	BrushingNoID	دفعات مسواک زدن دندان‌ها:	Categorical	{"1": "یک بار در روز", "2": "دو بار در روز", "3": "سه بار در روز", "4": "سایر", "5": "مسواک نمی‌زنم", "6": "دندان مصنوعی دارم"}	\N		t	1
db90c531-de99-4268-a47e-f98ae3b64806	88888888-8888-8888-8888-888888888888	B5	WristCircumference	دور مچ:	Continuous	\N	سانتی متر		f	5
81cbc0a3-4e85-4273-bb9e-5f43bf028225	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G1	SleepDuration24h1	خواب شبانه (متوسط):	Continuous	\N	ساعت		t	1
19adb858-8168-4cb9-9acd-9f7683cd364c	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G2	SleepDurationMidDay1	خواب عصر/میان‌روز:	Continuous	\N	ساعت		t	2
f0dc12dd-7b86-4b1a-bea6-186e0fae3169	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G4	TV1	تماشای تلویزیون/فیلم/گوش دادن به موسیقی:	Continuous	\N	ساعت		t	3
9d3bbd90-3284-4e4e-bf13-91292535c30f	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G5	Study1	مطالعه کتاب/مجله/روزنامه:	Continuous	\N	ساعت		t	4
7e318934-97f3-42b7-8eb2-cbaa9e6903a9	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G8	Eating1	غذا خوردن، نشستن در جلسات/مهمانی‌ها:	Continuous	\N	ساعت		t	5
f0417782-8ba9-458a-a33a-ce49d6700fa3	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G11	Cooking1	آشپزی، شستن ظروف، فعالیت‌های ایستاده:	Continuous	\N	ساعت		t	6
4f12a821-a107-4e8b-846b-96809d394045	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G12	HouseCleaning1	نظافت منزل، شستن لباس، جارو کشیدن:	Continuous	\N	ساعت		t	7
2334fa1e-b819-4781-a927-f3f7d542e066	aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	G14	Walking1	پیاده‌روی آهسته، پایین رفتن از پله:	Continuous	\N	ساعت		t	8
d9353cbc-3658-42b2-9038-d96ae5977b50	cccccccc-cccc-cccc-cccc-cccccccccccc	Q2	TeethNo	تعداد کل دندان‌ها:	Discrete	\N	دندان		t	2
db1d307a-ddd7-4638-b783-e072f702aded	cccccccc-cccc-cccc-cccc-cccccccccccc	Q3	DecayedTeethNo	تعداد دندان‌های پوسیده:	Discrete	\N	دندان		t	3
22c56a51-6c35-4058-802b-dd6e14170c85	cccccccc-cccc-cccc-cccc-cccccccccccc	Q4	MissingTeethNo	تعداد دندان‌های کشیده شده:	Discrete	\N	دندان		t	4
88df1ae3-2b24-47d0-8142-4a260efe79d3	cccccccc-cccc-cccc-cccc-cccccccccccc	Q5	FilledTeeth	تعداد دندان‌های پر شده:	Discrete	\N	دندان		t	5
08d63107-8105-40ca-a8e1-61cf92a9bcad	cccccccc-cccc-cccc-cccc-cccccccccccc	Q6	HasOralLesion	آیا ضایعه یا زخمی در دهان وجود دارد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	6
2c9583d7-71f8-408b-9f98-3261b7e456f4	cccccccc-cccc-cccc-cccc-cccccccccccc	Q7	UseFlossing	آیا از نخ دندان استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	7
32081034-a0f7-4216-ae13-a14d0f743363	cccccccc-cccc-cccc-cccc-cccccccccccc	Q8	FlossingNo	چند بار در هفته از نخ دندان استفاده می‌کنید؟	Discrete	\N	بار در هفته		f	8
7d0584cc-4883-4bd5-8df7-b270f1e40fb8	cccccccc-cccc-cccc-cccc-cccccccccccc	Q9	HasDentures	آیا دندان مصنوعی دارید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	9
3988a807-8ba8-43af-8978-f1e527599afb	cccccccc-cccc-cccc-cccc-cccccccccccc	Q10	FromWhenDentures	از چه سنی دندان مصنوعی دارید؟	Discrete	\N	سالگی		f	10
91d9d3a6-d096-45a6-bf55-de3ce693fe7e	cccccccc-cccc-cccc-cccc-cccccccccccc	Q12	UseMouthwash	آیا از دهانشویه استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	11
3cb239f3-ce3a-4dd0-9515-b2bf5ff36eaf	dddddddd-dddd-dddd-dddd-dddddddddddd	R1	SmokeCigaretteTypeID	آیا در طول زندگی حداقل ۱۰۰ نخ سیگار کشیده‌اید؟	Categorical	{"1": "بله", "2": "خیر"}	\N		t	1
c077810f-584a-4c72-95e5-d424df2aa02d	dddddddd-dddd-dddd-dddd-dddddddddddd	R2	FirstCigaretteAge	اولین سیگار را در چه سنی کشیدید؟	Discrete	\N	سالگی		f	2
b417a360-eed3-446d-ae71-a396d332e9c8	dddddddd-dddd-dddd-dddd-dddddddddddd	R3	RegularCigaretteAge	سیگار را به طور منظم از چه سنی شروع کردید؟	Discrete	\N	سالگی		f	3
ddc94856-2b83-4920-9734-226e94c6cd28	dddddddd-dddd-dddd-dddd-dddddddddddd	R4	CurrentSmokingTypeID	آیا هم اکنون سیگار می‌کشید؟	Categorical	{"1": "بله، روزانه", "2": "گاهی اوقات", "3": "خیر"}	\N		t	4
26d0028d-9799-469c-84b2-7ea3df99a2cf	dddddddd-dddd-dddd-dddd-dddddddddddd	R5	SmokingNo	به طور متوسط چند بار در شبانه‌روز سیگار می‌کشید؟	Discrete	\N	بار		f	5
1a95a772-7133-417c-bb2f-eb914227cad9	dddddddd-dddd-dddd-dddd-dddddddddddd	R6	StopSmokingAge	از چه سنی سیگار کشیدن روزانه را متوقف کرده‌اید؟	Discrete	\N	سالگی		f	6
4d589239-9e90-4ef6-85c1-57a01fe7226e	dddddddd-dddd-dddd-dddd-dddddddddddd	R9	SmokeInHomeNo	چند ساعت در روز در تماس با دود سیگار در منزل هستید؟	Continuous	\N	ساعت در روز		f	8
1dc4059b-0154-4da8-9563-c2f840d6c40b	dddddddd-dddd-dddd-dddd-dddddddddddd	R10	SmokeInWorkplaceID	آیا در محل کار در تماس با دود سیگار هستید؟	Categorical	{"1": "بله", "2": "خیر"}	\N		f	9
21621144-7b3e-4e4f-9f94-fa44f9f9c56a	dddddddd-dddd-dddd-dddd-dddddddddddd	R12	UseNonCigTobacco	آیا تاکنون از محصولات دخانی غیر سیگار (ناس، قلیان، چپق) استفاده کرده‌اید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	10
5fcb2e07-2ec2-44dc-bdab-3310ae9f03b7	eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	R13	UseDrugs	آیا تاکنون از مواد مخدر استفاده کرده‌اید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	1
4ca81bd5-7819-4682-bfd4-e0bb513ee061	eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	R14	UseAlcohol	آیا تاکنون از مشروبات الکلی استفاده کرده‌اید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	4
0f8336e9-0747-4e54-a48e-099747936e52	eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	Rd3	AlcoholTypeID	نوع مشروبات الکلی:	Categorical	{"1": "آبجو", "2": "مشروبات با الکل بالا (۴۰٪ و دکا، ویسکی، جین)", "3": "مشروبات دست ساز", "4": "سایر"}	\N		f	5
3d5615ae-8c93-4f80-a44f-8a560b186ef9	eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	Rc3	DrugTypeID	نوع ماده مخدر:	MultiSelect	{"1": "تریاک", "2": "هروئین", "3": "سوخته", "4": "شیره", "5": "شیشه", "6": "کوکائین", "7": "کراک", "8": "کریستال", "9": "پان", "10": "سایر"}	\N		f	2
86ac4772-9391-434b-ab07-4c367e57f189	eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	Rc4	DrugUseTypeID	روش مصرف:	Categorical	{"1": "خوراکی", "2": "استنشاقی", "3": "تزریقی"}	\N		f	3
1e6799be-eb3d-4170-b01c-a5e3b886cb60	ffffffff-ffff-ffff-ffff-ffffffffffff	S1	RightDBP1	فشار خون دیاستولیک - بازوی راست (اندازه‌گیری اول):	Discrete	\N	میلیمتر جیوه		t	1
cee19c6d-de4e-49f4-a7bd-e8ff2b439111	ffffffff-ffff-ffff-ffff-ffffffffffff	S2	RightDBP2	فشار خون دیاستولیک - بازوی راست (اندازه‌گیری دوم):	Discrete	\N	میلیمتر جیوه		t	2
373854b9-a1d5-422a-8af4-53dc2641d950	ffffffff-ffff-ffff-ffff-ffffffffffff	S3	RightSBP1	فشار خون سیستولیک - بازوی راست (اندازه‌گیری اول):	Discrete	\N	میلیمتر جیوه		t	3
9d002099-eb51-4976-929d-9c52fd848c0d	ffffffff-ffff-ffff-ffff-ffffffffffff	S4	RightSBP2	فشار خون سیستولیک - بازوی راست (اندازه‌گیری دوم):	Discrete	\N	میلیمتر جیوه		t	4
276f19c5-e451-4bf7-a017-b62843dfa6cf	ffffffff-ffff-ffff-ffff-ffffffffffff	S5	LeftDBP1	فشار خون دیاستولیک - بازوی چپ (اندازه‌گیری اول):	Discrete	\N	میلیمتر جیوه		t	5
f0eac45d-293b-481b-a41e-11805b147925	ffffffff-ffff-ffff-ffff-ffffffffffff	S6	LeftDBP2	فشار خون دیاستولیک - بازوی چپ (اندازه‌گیری دوم):	Discrete	\N	میلیمتر جیوه		t	6
dcfccfb5-4691-4d47-91a7-2a42c3c5ec73	ffffffff-ffff-ffff-ffff-ffffffffffff	S7	LeftSBP1	فشار خون سیستولیک - بازوی چپ (اندازه‌گیری اول):	Discrete	\N	میلیمتر جیوه		t	7
d6f224ac-f089-4747-b46b-6bb91b0409dd	ffffffff-ffff-ffff-ffff-ffffffffffff	S8	LeftSBP2	فشار خون سیستولیک - بازوی چپ (اندازه‌گیری دوم):	Discrete	\N	میلیمتر جیوه		t	8
f7b0b36e-b457-4ff6-baf4-af6eea031281	ffffffff-ffff-ffff-ffff-ffffffffffff	S9	PR1	تعداد ضربان قلب در حالت استراحت (اندازه‌گیری اول):	Discrete	\N	ضربان در دقیقه		t	9
919bb7d2-90e2-4af5-968c-d7d872446533	ffffffff-ffff-ffff-ffff-ffffffffffff	S10	PR2	تعداد ضربان قلب در حالت استراحت (اندازه‌گیری دوم):	Discrete	\N	ضربان در دقیقه		t	10
49f2d313-1c96-40c4-b7f9-f3087433e8ab	10101010-1010-1010-1010-101010101010	X1	HasUrine	آیا نمونه ادرار گرفته شد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	1
ec393e54-806d-4dbb-8357-05ed680dfd4d	10101010-1010-1010-1010-101010101010	X2	HasBlood	آیا نمونه خون گرفته شد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	2
14620114-7ce1-4a4e-9c8d-684d9edd2b79	10101010-1010-1010-1010-101010101010	X3	HasHair	آیا نمونه مو گرفته شد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	3
73bd57cf-06bc-43f6-9ced-4a9ad3c5d731	10101010-1010-1010-1010-101010101010	X4	HasNail	آیا نمونه ناخن گرفته شد؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	4
45565419-5aaa-44b3-b724-cbc08e837d83	99999999-9999-9999-9999-999999999999	U10	ReUseOil	آیا روغن پس از سرخ کردن را دوباره استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	17
3761d135-3e77-4a5f-a9b2-36553f488f00	99999999-9999-9999-9999-999999999999	U12	ReUseMold	اگر غذایی مثل رب، مربا، ترشی کپک زده بود، قسمتی از آن را برداشته و بقیه را مصرف می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	18
930f1c98-6083-4a95-b64c-06b3fec09dc2	99999999-9999-9999-9999-999999999999	U13	SmokedFoodIntID	آیا از غذاهای دودی (برنج دودی، ماهی دودی) استفاده می‌کنید؟	Categorical	{"0": "هرگز", "1": "کمتر از ۱-۳ بار در ماه", "2": "۱-۳ بار در هفته", "3": "روزانه"}	\N		t	19
9183d819-b263-4653-ab2c-34f2209b5e7d	99999999-9999-9999-9999-999999999999	U20	TeaTempUseID	چای و قهوه را با چه دمایی می‌خورید؟	Categorical	{"1": "داغ", "2": "گرم (وارم)", "3": "سرد", "4": "مصرف نمی‌کند"}	\N		t	20
bf0f4cc9-07df-456a-a501-4d24c4cf73b9	99999999-9999-9999-9999-999999999999	U21	SoupTempUseID	سوپ، آش و سایر غذاهای آبکی را با چه دمایی می‌خورید؟	Categorical	{"1": "داغ", "2": "گرم (وارم)", "3": "سرد", "4": "مصرف نمی‌کند"}	\N		t	21
b6b1419a-6c82-4efd-b714-ae4f011ce0dc	99999999-9999-9999-9999-999999999999	U43	UseBoiledHerbal	آیا از دمنوش‌های داروهای گیاهی، عرقیجات و یا پودرهای گیاهی استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	22
cb787f87-b5b0-495c-a2e6-cc6138ee49b1	88888888-8888-8888-8888-888888888888	B1	HeightCm	قد چند سانتی متر است	Continuous	\N	سانتی متر		t	1
b348042c-70f8-4437-b367-fc4dab75e70c	88888888-8888-8888-8888-888888888888	B2	WeightKg	وزن:	Continuous	\N	کیلوگرم		t	2
b440c4f2-6a34-4fc7-b085-1a2a88536cd9	11111111-1111-1111-1111-111111111111	A8	MotherEthnicityID	قومیت مادر:	Categorical	{"1": "فارس", "2": "آذری", "3": "بلوچ", "4": "کرد", "5": "لر", "6": "عرب", "7": "ترکمن", "8": "تالش", "9": "زابلی", "10": "گیلک", "11": "ترک ایل", "12": "عرب ایل", "13": "مازنی", "14": "توت", "15": "سایر", "16": "ترک"}	\N		f	5
361cb827-9e38-4e59-b533-b07ae6547507	11111111-1111-1111-1111-111111111111	A10	FatherEthnicityID	قومیت پدر:	Categorical	{"1": "فارس", "2": "آذری", "3": "بلوچ", "4": "کرد", "5": "لر", "6": "عرب", "7": "ترکمن", "8": "تالش", "9": "زابلی", "10": "گیلک", "11": "ترک ایل", "12": "عرب ایل", "13": "مازنی", "14": "توت", "15": "سایر", "16": "ترک"}	\N		f	6
3e2f8377-187d-4673-b35a-a99012cbfc96	11111111-1111-1111-1111-111111111111	A20	EducationYears	تعداد سال‌های تحصیل:	Discrete	\N	سال		t	7
70ce12a6-6cea-402e-82ea-4bf5df1da6f7	11111111-1111-1111-1111-111111111111	A21	LastEduID	آخرین مدرک تحصیلی:	Categorical	{"1": "ابتدایی", "2": "راهنمایی", "3": "دیپلم", "4": "فوق دیپلم", "5": "لیسانس", "6": "فوق لیسانس", "7": "دکترا", "8": "بی سواد"}	\N		t	8
163e3f6c-10f2-4d18-a075-0b5fda2b13ba	11111111-1111-1111-1111-111111111111	A22	FamilyStatusID	موقعیت شما در خانواده:	Categorical	{"1": "پدر", "2": "مادر", "3": "فرزند", "4": "پدربزرگ/مادربزرگ", "5": "عمه/عمو", "6": "خاله/دایی", "7": "سایر"}	\N		t	9
81de0808-1c6f-4f79-9d1a-52ee4e9d11a9	99999999-9999-9999-9999-999999999999	U2	SaltUseID	آیا به غذای خود نمک اضافه می‌کنید؟	Categorical	{"1": "بله", "2": "گاهی", "3": "خیر"}	\N		t	12
68bb1133-1385-4325-8254-7c269e5ef805	22222222-2222-2222-2222-222222222222	C2	HouseArea	متراژ واحد مسکونی:	Continuous	\N	متر مربع		t	2
ae4cfb2e-651d-44dc-bf71-6535c771fe76	22222222-2222-2222-2222-222222222222	C3	HouseroomNo	تعداد اتاق‌های خواب:	Discrete	\N	اتاق		t	3
a6670484-ec02-4032-a76e-e189ddac7920	22222222-2222-2222-2222-222222222222	C23	BookNoRead	تعداد کتاب‌های غیر درسی که در یک سال گذشته مطالعه کرده‌اید:	Discrete	\N	کتاب		f	13
d793d402-99fb-48d8-9b6e-1d6b14b6f2ca	22222222-2222-2222-2222-222222222222	C27	NationalTravelNo	تعداد مسافرت‌های داخل ایران در ده سال گذشته:	Discrete	\N	مورد		f	17
6f993e5e-92f1-4959-af20-2de5d8163c64	33333333-3333-3333-3333-333333333333	H10	NightShiftWork	آیا در طول یک سال گذشته کار شبانه داشته‌اید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	11
ecdb0ed1-aa40-4797-b4e0-12181a3bbcb6	33333333-3333-3333-3333-333333333333	J11	UseInHome	آیا از حشره‌کش در خانه استفاده می‌کنید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		f	19
e72ca677-8b52-474a-b66e-f53a1daf07ae	99999999-9999-9999-9999-999999999999	T1	Bread_Lavash	نان لواش:	Continuous	\N	گرم در روز		f	1
66c04e6e-b9cc-4d49-907a-7bfe75c7c96b	99999999-9999-9999-9999-999999999999	T5	Cooked_rice	برنج پخته:	Continuous	\N	گرم در روز		f	2
bd82e112-410f-40ed-8308-348f6235fa85	99999999-9999-9999-9999-999999999999	T15	Red_meat	گوشت قرمز:	Continuous	\N	گرم در روز		f	3
0a8cb1a0-fb39-4513-ad58-729dce1c93fa	99999999-9999-9999-9999-999999999999	T16	Chicken	گوشت مرغ:	Continuous	\N	گرم در روز		f	4
38c9d2f3-fec7-4122-ac75-19cc9db34280	99999999-9999-9999-9999-999999999999	T18	Eggs	تخم مرغ:	Continuous	\N	گرم در روز		f	5
fabbed58-5858-4757-b84e-a0292ee5b019	99999999-9999-9999-9999-999999999999	T28	Milk	شیر:	Continuous	\N	گرم در روز		f	6
4c152af7-33b0-4c8a-a0aa-1d50d781bef4	99999999-9999-9999-9999-999999999999	T29	Yogurt	ماست:	Continuous	\N	گرم در روز		f	7
2e5a2d4b-2b78-418d-9037-a03429d57c5e	99999999-9999-9999-9999-999999999999	T30	Cheese	پنیر:	Continuous	\N	گرم در روز		f	8
4bee31d7-ffa9-4b9e-9d05-91ea04a0bae0	99999999-9999-9999-9999-999999999999	T31	Doogh	دوغ:	Continuous	\N	گرم در روز		f	9
52044ed7-8776-41b1-88c3-4c7b96bda565	99999999-9999-9999-9999-999999999999	T113	Salt	نمک:	Continuous	\N	گرم در روز		f	10
03f334de-4be0-4933-a494-bed3614e3452	11111111-1111-1111-1111-111111111111	A27	FirstMarriageAge	سن در زمان اولین ازدواج:	Discrete	\N	سال		f	12
1a9b51a3-a3e6-43a3-98fa-d88d7df91056	dddddddd-dddd-dddd-dddd-dddddddddddd	R8	SmokeInHome	آیا در معرض تماس با دود سیگار در منزل بوده/هستید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N		t	7
7993e427-00d6-4f99-98f8-c06f61683601	99999999-9999-9999-9999-999999999999	U1	EatIntID	به طور متوسط چند وعده غذا در روز می‌خورید؟	Categorical	{"1": "۳ وعده (صبحانه، ناهار، شام)", "2": "۴ وعده", "3": "۵-۶ وعده", "4": "بیشتر از ۶ وعده", "5": "کمتر از ۳ وعده"}	\N		t	11
9579cbd0-4aad-4982-8b91-f7ad72107c62	99999999-9999-9999-9999-999999999999	U3	FoodSaltUsedID	غذایی که می‌خورید چقدر شور است؟	Categorical	{"1": "کم نمک", "2": "معمولی", "3": "شور"}	\N		t	13
1e570771-c319-4b10-93a8-3e227c25db17	99999999-9999-9999-9999-999999999999	U4	GrilledFoodIntID	چند وقت یکبار غذای کبابی مصرف می‌کنید؟	Categorical	{"0": "هرگز", "1": "کمتر از یک بار در ماه", "2": "۱-۳ بار در ماه", "3": "۱-۳ بار در هفته", "4": "روزانه"}	\N		t	14
e3795fe6-ceff-4232-82e1-ef992ef8a092	99999999-9999-9999-9999-999999999999	U5	FriedFoodIntID	چند وقت یکبار غذای سرخ شده مصرف می‌کنید؟	Categorical	{"0": "هرگز", "1": "کمتر از یک بار در ماه", "2": "۱-۳ بار در ماه", "3": "۱-۳ بار در هفته", "4": "روزانه"}	\N		t	15
47430cd8-44ce-4275-9c0e-13df6a26adb2	99999999-9999-9999-9999-999999999999	U9	UsedOilTypeID	چه نوع روغنی برای سرخ کردن استفاده می‌کنید؟	Categorical	{"1": "روغن جامد (دنبه/کره)", "2": "روغن نیمه جامد (مارگارین)", "3": "روغن مایع", "4": "روغن مخصوص سرخ کردنی", "5": "سایر", "6": "سرخ کردن انجام نمی‌دهم"}	\N		t	16
0744566e-2bd7-4ac5-9b29-01e751844e6f	44444444-4444-4444-4444-444444444444	K1	HasDiabetes	آیا به دیابت مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	1
8c23c4d9-0f08-4db9-9cfd-9645514b2c35	44444444-4444-4444-4444-444444444444	K2	DiabetesStartAge	سن در زمان تشخیص دیابت:	Discrete	\N	سال	\N	f	2
4b7ec000-95f6-403e-8fbd-44ecbdba5e60	44444444-4444-4444-4444-444444444444	K3	DiabetesInTreatment	آیا تحت درمان برای دیابت بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	3
474c34d2-e294-4a67-b0a6-4f922dcae3ae	44444444-4444-4444-4444-444444444444	K4	HasHypertension	آیا به فشار خون بالا مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	4
d2c7e6d9-44f4-4606-86f9-8718e365c4c5	44444444-4444-4444-4444-444444444444	K5	HypertensionStartAge	سن در زمان تشخیص فشار خون بالا:	Discrete	\N	سال	\N	f	5
7369e1bc-0690-4a57-a076-1b385ce12a9c	44444444-4444-4444-4444-444444444444	K6	HypertensionInTreatment	آیا تحت درمان برای فشار خون بالا بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	6
782bc506-7e7d-42f5-89ee-3d4302354ea2	44444444-4444-4444-4444-444444444444	K7	HasCardiacDisease	آیا به بیماری ایسکمیک قلبی (نارسایی قلبی، آنژین) مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	7
34310944-a24d-4de5-a48f-9a686a36e3b4	44444444-4444-4444-4444-444444444444	K8	CardiacDiseaseStartAge	سن در زمان تشخیص بیماری ایسکمیک قلبی:	Discrete	\N	سال	\N	f	8
2e621892-ef6d-4123-b46e-69a6153af08e	44444444-4444-4444-4444-444444444444	K9	CardiacDiseaseInTreatment	آیا تحت درمان برای بیماری ایسکمیک قلبی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	9
44daa61f-30ff-4e37-af3f-6db582c9164c	44444444-4444-4444-4444-444444444444	K10	HasMI	آیا سابقه سکته قلبی دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	10
d2eb31b6-9311-43cd-bafc-70415c9ac3a0	44444444-4444-4444-4444-444444444444	K11	MIStartAge	سن در زمان تشخیص سکته قلبی:	Discrete	\N	سال	\N	f	11
2e41ec97-abe0-4620-b578-84d2564c8f4f	44444444-4444-4444-4444-444444444444	K12	MIInTreatment	آیا تحت درمان برای سکته قلبی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	12
9e1a8878-c0ec-4faf-a655-e07624bd6511	44444444-4444-4444-4444-444444444444	K13	HasStroke	آیا سابقه سکته مغزی دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	13
a0ae35a5-bc8a-4dbb-95c9-36eb652e5a69	44444444-4444-4444-4444-444444444444	K14	StrokeStartAge	سن در زمان تشخیص سکته مغزی:	Discrete	\N	سال	\N	f	14
22e166fa-a43c-4bd2-897d-98436b4694da	44444444-4444-4444-4444-444444444444	K15	StrokeInTreatment	آیا تحت درمان برای سکته مغزی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	15
3e594923-915a-4847-bc7d-cbbadfe54e8d	44444444-4444-4444-4444-444444444444	K16	HasRenalFailure	آیا به نارسایی کلیه مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	16
206277fe-e828-4322-97d9-b71c283c8f9f	44444444-4444-4444-4444-444444444444	K17	RenalFailureStartAge	سن در زمان تشخیص نارسایی کلیه:	Discrete	\N	سال	\N	f	17
3f2e962d-6195-4ec9-bd7e-be63c37fc5b1	44444444-4444-4444-4444-444444444444	K18	RenalFailureInTreatment	آیا تحت درمان برای نارسایی کلیه بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	18
8434933d-52ad-4bf1-b838-74cc49516259	44444444-4444-4444-4444-444444444444	K19	HasFattyLiver	آیا به کبد چرب مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	19
f309f567-0d6d-44b0-b14a-51d9b50464e5	44444444-4444-4444-4444-444444444444	K20	FattyLiverStartAge	سن در زمان تشخیص کبد چرب:	Discrete	\N	سال	\N	f	20
1c81560d-b2d1-4f86-9e6c-dbe3fa2a43cf	44444444-4444-4444-4444-444444444444	K21	FattyLiverInTreatment	آیا تحت درمان برای کبد چرب بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	21
99ae93d6-8382-4871-a61a-0cbbca217c65	44444444-4444-4444-4444-444444444444	K22	HasHepatitisB	آیا به هپاتیت B مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	22
eae78dbe-9609-49f5-89ee-74d705e0dcaa	44444444-4444-4444-4444-444444444444	K23	HepatitisBStartAge	سن در زمان تشخیص هپاتیت B:	Discrete	\N	سال	\N	f	23
62597938-7f07-4b4b-9021-5a678d6a4a2b	44444444-4444-4444-4444-444444444444	K24	HepatitisBInTreatment	آیا تحت درمان برای هپاتیت B بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	24
415c6ee7-1a36-4be1-90ce-74d6f973a8cd	44444444-4444-4444-4444-444444444444	K25	HasHepatitisC	آیا به هپاتیت C مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	25
888f5b1c-31ef-47ac-a598-e8f784654777	44444444-4444-4444-4444-444444444444	K26	HepatitisCStartAge	سن در زمان تشخیص هپاتیت C:	Discrete	\N	سال	\N	f	26
bdaa933d-ab96-4168-abbd-a0c28bd15c97	44444444-4444-4444-4444-444444444444	K27	HepatitisCInTreatment	آیا تحت درمان برای هپاتیت C بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	27
eeef5cc2-e564-4f54-ac40-ac671925dbdb	44444444-4444-4444-4444-444444444444	K28	HasChronicLungDisease	آیا به بیماری مزمن ریوی (سل/آسم) مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	28
859709cc-255d-4307-a245-0e2b30c66a4c	44444444-4444-4444-4444-444444444444	K29	ChronicLungDiseaseStartAge	سن در زمان تشخیص بیماری مزمن ریوی:	Discrete	\N	سال	\N	f	29
ad435461-e4f9-4b83-98bb-bab7fa4f9456	44444444-4444-4444-4444-444444444444	K30	ChronicLungDiseaseInTreatment	آیا تحت درمان برای بیماری مزمن ریوی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	30
e7a0c415-3be5-4d8b-89eb-37ccf12d2199	44444444-4444-4444-4444-444444444444	K31	HasThyroquestion_idDisease	آیا به بیماری تیروئید مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	31
fde2ae37-848b-4c42-aaf5-8b495c0f4b08	44444444-4444-4444-4444-444444444444	K32	Thyroquestion_idDiseaseStartAge	سن در زمان تشخیص بیماری تیروئید:	Discrete	\N	سال	\N	f	32
348e0e23-7a94-4798-a81e-aaf6cda119eb	44444444-4444-4444-4444-444444444444	K33	Thyroquestion_idDiseaseInTreatment	آیا تحت درمان برای بیماری تیروئید بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	33
4ee7be09-b5d9-4d5b-a989-fac298478c96	44444444-4444-4444-4444-444444444444	K34	HasKquestion_idneyStone	آیا سابقه سنگ کلیه دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	34
23e45016-ab60-4f86-aa9c-58144a3e5efe	44444444-4444-4444-4444-444444444444	K35	Kquestion_idneyStoneStartAge	سن در زمان تشخیص سنگ کلیه:	Discrete	\N	سال	\N	f	35
a1159e4c-5322-4076-92c0-9665477442a4	44444444-4444-4444-4444-444444444444	K36	Kquestion_idneyStoneInTreatment	آیا تحت درمان برای سنگ کلیه بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	36
f3ca3b2a-21da-44c6-9c70-4d5b0270927c	44444444-4444-4444-4444-444444444444	K37	HasGallstone	آیا سابقه سنگ کیسه صفرا دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	37
3d867e5f-c910-4192-8e76-12a29307833a	44444444-4444-4444-4444-444444444444	K38	GallstoneStartAge	سن در زمان تشخیص سنگ کیسه صفرا:	Discrete	\N	سال	\N	f	38
ed9ee073-d3c0-48ce-895e-50e443d27e3a	44444444-4444-4444-4444-444444444444	K39	GallstoneInTreatment	آیا تحت درمان برای سنگ کیسه صفرا بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	39
adc55572-03d2-4343-bff3-7ff968462c3d	44444444-4444-4444-4444-444444444444	K40	HasRheumaticDisease	آیا به بیماری روماتیسمی مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	40
f1dd12c2-8b60-4607-8ac9-147359154d4d	44444444-4444-4444-4444-444444444444	K41	RheumaticDiseaseStartAge	سن در زمان تشخیص بیماری روماتیسمی:	Discrete	\N	سال	\N	f	41
fd9d8200-cc13-482d-8562-cf4ff5a37dfa	44444444-4444-4444-4444-444444444444	K42	RheumaticDiseaseInTreatment	آیا تحت درمان برای بیماری روماتیسمی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	42
c203f08b-ce21-4560-8439-9553418a96d0	44444444-4444-4444-4444-444444444444	K43	HasSkinCancer	آیا سابقه سرطان پوست دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	43
78ac90f1-f315-490d-a588-bdd6af9fb1fc	44444444-4444-4444-4444-444444444444	K44	SkinCancerStartAge	سن در زمان تشخیص سرطان پوست:	Discrete	\N	سال	\N	f	44
bab3a510-3431-4ad4-8fb3-771de3b6fc1c	44444444-4444-4444-4444-444444444444	K45	SkinCancerInTreatment	آیا تحت درمان برای سرطان پوست بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	45
edcad0ca-b1fd-47b3-93c2-695cead79825	44444444-4444-4444-4444-444444444444	K46	HasBreastCancer	آیا سابقه سرطان پستان دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	f	46
ede4a288-3e25-43b5-97d4-05eccf4655c4	44444444-4444-4444-4444-444444444444	K47	BreastCancerStartAge	سن در زمان تشخیص سرطان پستان:	Discrete	\N	سال	\N	f	47
67b74cc8-59ea-4825-bc41-4fa97066fbe2	44444444-4444-4444-4444-444444444444	K48	BreastCancerInTreatment	آیا تحت درمان برای سرطان پستان بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	48
ec11aeef-47fa-46a8-ad5a-2955c5805c97	44444444-4444-4444-4444-444444444444	K49	HasStomachCancer	آیا سابقه سرطان معده دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	49
572b0542-306e-41b1-b476-5dfa5c24f5e0	44444444-4444-4444-4444-444444444444	K50	StomachCancerStartAge	سن در زمان تشخیص سرطان معده:	Discrete	\N	سال	\N	f	50
0a71411b-3184-4b95-aadb-2ad9afe5c203	44444444-4444-4444-4444-444444444444	K51	StomachCancerInTreatment	آیا تحت درمان برای سرطان معده بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	51
a5122456-2e02-4e60-8334-341ad6a79b2d	44444444-4444-4444-4444-444444444444	K52	HasColorectalCancer	آیا سابقه سرطان کولورکتال دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	52
10f2998d-3ec7-4ef4-81ed-12f67c72e40f	44444444-4444-4444-4444-444444444444	K53	ColorectalCancerStartAge	سن در زمان تشخیص سرطان کولورکتال:	Discrete	\N	سال	\N	f	53
ce63745b-824c-4fd4-a57e-d7570c69487d	44444444-4444-4444-4444-444444444444	K54	ColorectalCancerInTreatment	آیا تحت درمان برای سرطان کولورکتال بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	54
bf052671-937d-42cc-a787-d8e3baafa948	44444444-4444-4444-4444-444444444444	K55	HasBladderCancer	آیا سابقه سرطان مثانه دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	55
b5ad5efe-40a3-4f50-9705-582c82d065a5	44444444-4444-4444-4444-444444444444	K56	BladderCancerStartAge	سن در زمان تشخیص سرطان مثانه:	Discrete	\N	سال	\N	f	56
dad5afbf-249d-40c3-894a-4aab5837de3a	44444444-4444-4444-4444-444444444444	K57	BladderCancerInTreatment	آیا تحت درمان برای سرطان مثانه بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	57
2777b8d4-1693-4052-a661-52634fe2c792	44444444-4444-4444-4444-444444444444	K58	HasHSC	آیا سابقه سرطان سیستم هماتوپوئیتیک دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	58
1f36b6df-d624-4bfb-8251-57205ce19536	44444444-4444-4444-4444-444444444444	K59	HSCStartAge	سن در زمان تشخیص سرطان سیستم هماتوپوئیتیک:	Discrete	\N	سال	\N	f	59
e30da046-58b8-4e9c-ab76-6e52442f8ff5	44444444-4444-4444-4444-444444444444	K60	HSCInTreatment	آیا تحت درمان برای سرطان سیستم هماتوپوئیتیک بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	60
9f3371c7-22d6-41ce-83d0-71666d66bc44	44444444-4444-4444-4444-444444444444	K61	HasEsophagealCancer	آیا سابقه سرطان مری دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	61
f0abb840-39ae-42f5-aaed-f9c0a1fdf41f	44444444-4444-4444-4444-444444444444	K62	EsophagealCancerStartAge	سن در زمان تشخیص سرطان مری:	Discrete	\N	سال	\N	f	62
c1413b29-6ac1-4e46-842d-f5c069a1d318	44444444-4444-4444-4444-444444444444	K63	EsophagealCancerInTreatment	آیا تحت درمان برای سرطان مری بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	63
b6fd3566-993b-4505-9f62-d0eec0410d98	44444444-4444-4444-4444-444444444444	K64	HasProstateCancer	آیا سابقه سرطان پروستات دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	f	64
65bb51bb-098f-4b2e-9df8-b3d11c9b7feb	44444444-4444-4444-4444-444444444444	K65	ProstateCancerStartAge	سن در زمان تشخیص سرطان پروستات:	Discrete	\N	سال	\N	f	65
109747a6-b1e0-442d-8f7f-ee4521910f15	44444444-4444-4444-4444-444444444444	K66	ProstateCancerInTreatment	آیا تحت درمان برای سرطان پروستات بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	66
c7a0a81a-da9d-48c8-a5e2-007d81868b08	44444444-4444-4444-4444-444444444444	K67	HasLungCancer	آیا سابقه سرطان ریه دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	67
54526e6f-ce1c-4a02-aa7d-1f1bdcfb0728	44444444-4444-4444-4444-444444444444	K68	LungCancerStartAge	سن در زمان تشخیص سرطان ریه:	Discrete	\N	سال	\N	f	68
2cdf03f3-061b-44eb-9839-6320822ada04	44444444-4444-4444-4444-444444444444	K69	LungCancerInTreatment	آیا تحت درمان برای سرطان ریه بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	69
00fd7f1c-bfb5-4220-a195-dd27e184112f	44444444-4444-4444-4444-444444444444	K70	HasBrainAndCNSCancer	آیا سابقه سرطان مغز و اعصاب مرکزی دارید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	70
5b39af6e-9e3e-4593-a25d-93a8017f0edb	44444444-4444-4444-4444-444444444444	K71	BrainAndCNSCancerStartAge	سن در زمان تشخیص سرطان مغز و اعصاب مرکزی:	Discrete	\N	سال	\N	f	71
6d81c1b1-a41f-4618-b84b-9e1cdcd65776	44444444-4444-4444-4444-444444444444	K72	BrainAndCNSCancerInTreatment	آیا تحت درمان برای سرطان مغز و اعصاب مرکزی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	72
21b9c1a0-3807-449c-b1b2-09cb3fa72a00	44444444-4444-4444-4444-444444444444	K73	HasEpilepsy	آیا به صرع مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	73
5f5cc28a-26eb-4ed8-b4d2-5f652681930a	44444444-4444-4444-4444-444444444444	K74	EpilepsyStartAge	سن در زمان تشخیص صرع:	Discrete	\N	سال	\N	f	74
2d174601-4a0a-4f5f-863d-ba78ee412f57	44444444-4444-4444-4444-444444444444	K75	EpilepsyInTreatment	آیا تحت درمان برای صرع بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	75
802a0cbf-eddb-4984-a8ea-654ce8ad18f4	44444444-4444-4444-4444-444444444444	K76	HasChronicHeadaches	آیا به سردرد مزمن و عودکننده مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	76
26425d55-ad04-4e41-b84b-e0ffb3d0b3cc	44444444-4444-4444-4444-444444444444	K77	ChronicHeadachesStartAge	سن در زمان تشخیص سردرد مزمن:	Discrete	\N	سال	\N	f	77
84512058-c219-4746-8d21-6e6a17f3439c	44444444-4444-4444-4444-444444444444	K78	ChronicHeadachesInTreatment	آیا تحت درمان برای سردرد مزمن بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	78
5a3a568b-d8a3-4a79-8e59-1c9e134e391a	44444444-4444-4444-4444-444444444444	K79	HasDepression	آیا به افسردگی مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	79
f00e5e64-eec1-470e-a9c4-c7e93f8806de	44444444-4444-4444-4444-444444444444	K80	DepressionStartAge	سن در زمان تشخیص افسردگی:	Discrete	\N	سال	\N	f	80
a8ebf04c-33bb-4489-80b9-347aac7eb438	44444444-4444-4444-4444-444444444444	K81	DepressionInTreatment	آیا تحت درمان برای افسردگی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	81
e099a3e9-69bf-4468-b47a-24a653531f56	44444444-4444-4444-4444-444444444444	K82	HasPsychiatricDisorder	آیا به اختلال روانپزشکی (غیر از افسردگی) مبتلا هستید؟	Categorical	{"0": "خیر", "1": "بله", "2": "نمی‌دانم"}	\N	\N	t	82
00bb2b0f-aac0-4c11-a06a-034dc93a2e5c	44444444-4444-4444-4444-444444444444	K83	PsychiatricDisorderStartAge	سن در زمان تشخیص اختلال روانپزشکی:	Discrete	\N	سال	\N	f	83
a5302ac7-7c7e-4f9a-a54c-4f32c16eb3d5	44444444-4444-4444-4444-444444444444	K84	PsychiatricDisorderInTreatment	آیا تحت درمان برای اختلال روانپزشکی بوده/استید؟	Dichotomous	{"0": "خیر", "1": "بله"}	\N	\N	f	84
225a3402-fa51-4acb-aa00-f92e49fd429f	11111111-1111-1111-1111-111111111111	A3	CohortCenterID	مرکز کوهورت (این بخش از داشبرد تغییر کرده برای تست)	Categorical	{"2": "روانسر", "3": "گیلان", "4": "فسا", "5": "آذر", "6": "خرامه", "7": "مازندران", "8": "زاهدان", "9": "یزد", "10": "رفسنجان", "11": "هویزه", "12": "شهرکرد", "13": "بندرکنگ", "14": "دریاچه ارومیه", "15": "اردبیل", "16": "سبزوار", "17": "مشهد", "18": "دنا", "19": "کوار", "20": "دهقلان"}			t	2
\.


--
-- TOC entry 4983 (class 0 OID 16428)
-- Dependencies: 223
-- Data for Name: responses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.responses (response_id, submission_id, question_id, v_code, is_voice, transcript, extracted_value, extracted_value_json, ai_confidence, processed_at) FROM stdin;
8b621cd3-2ce0-47dd-9238-1c23dd6cd1f3	b390282a-2e0f-4433-89f9-0b165925dbf7	c4256938-c2f2-4883-aad5-091344f28a3f	H7	f	\N	00	\N	\N	2026-06-05 21:13:49.521905+03:30
7b3f9ec9-456a-4abf-8a6d-775828cd319f	b390282a-2e0f-4433-89f9-0b165925dbf7	cb787f87-b5b0-495c-a2e6-cc6138ee49b1	B1	t	الو من ۱۸۰ سانتیمتر ۷۳ کیلو وزن دارم دور کمرم ۷۰ سانتیمتره دور باسنم ۴۵ و دور مچم ۱۵ سانتیمتره	180	\N	1	2026-06-05 21:29:13.166895+03:30
cfe035c1-3090-4e20-adc4-69ed36852ff7	b390282a-2e0f-4433-89f9-0b165925dbf7	db90c531-de99-4268-a47e-f98ae3b64806	B5	t	الو من ۱۸۰ سانتیمتر ۷۳ کیلو وزن دارم دور کمرم ۷۰ سانتیمتره دور باسنم ۴۵ و دور مچم ۱۵ سانتیمتره	15	\N	1	2026-06-05 21:29:13.166895+03:30
d955d665-0dd3-435a-89b4-90a1d1326ca2	b390282a-2e0f-4433-89f9-0b165925dbf7	b348042c-70f8-4437-b367-fc4dab75e70c	B2	t	الو من ۱۸۰ سانتیمتر ۷۳ کیلو وزن دارم دور کمرم ۷۰ سانتیمتره دور باسنم ۴۵ و دور مچم ۱۵ سانتیمتره	73	\N	1	2026-06-05 21:29:13.166895+03:30
4d4f6b37-f8ff-487e-80ca-223419942f4c	b390282a-2e0f-4433-89f9-0b165925dbf7	21baa735-202a-41e9-aa5b-2eb27a40edb9	H12	t	ببین من دوست دارم ساعت ۷ بیدار بشم و داخل خواب پاهامو زیاد تکون میدم.	1	\N	1	2026-06-05 21:13:49.521905+03:30
56d54bd0-3b86-4892-83f7-6ce191e9e4d4	b390282a-2e0f-4433-89f9-0b165925dbf7	82148430-cdff-4faa-96fe-0a5d8542cdda	H6	t	ببین من دوست دارم ساعت ۷ بیدار بشم و داخل خواب پاهامو زیاد تکون میدم.	7	\N	1	2026-06-05 21:13:49.521905+03:30
210060b1-531f-4a6f-8c57-8779e0d8fad8	b390282a-2e0f-4433-89f9-0b165925dbf7	22c56a51-6c35-4058-802b-dd6e14170c85	Q4	t	من دو بار در روز مسواک میزنم. ۳۰ تا دندون دارم. دو تاشو کشیدم. یه دونه‌ش خرابه الان. دو تاشو پر کردم. زخم دهان دارم. نخ دندون استفاده نمیکنم من. دنده مصنوعی هم ندارم. دهانشویه استفاده نمیکنم.	2	\N	1	2026-06-05 21:15:13.20541+03:30
17e0fb3f-96fa-49ee-8fde-1e83a7139b50	b390282a-2e0f-4433-89f9-0b165925dbf7	91d9d3a6-d096-45a6-bf55-de3ce693fe7e	Q12	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	1	\N	1	2026-06-05 21:15:13.20541+03:30
2f55527c-a604-4385-a02d-6248e071db64	b390282a-2e0f-4433-89f9-0b165925dbf7	32081034-a0f7-4216-ae13-a14d0f743363	Q8	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	7	\N	1	2026-06-05 21:15:13.20541+03:30
3893518b-d55d-4343-affb-7fe01e8754d2	b390282a-2e0f-4433-89f9-0b165925dbf7	5fcb2e07-2ec2-44dc-bdab-3310ae9f03b7	R13	t	اوه مواد مخدر استفاده کردم شیشه و تریاک روش مصرفش خب هر کدوم فرق میکنه اگه مثلا شیشه خوراکی نیست که تریاک و خوراکیه نمیدونم اینو خودت تصمیم بگیر بعد مشروبات الکلی بله نوع مشروبات هم دست ساز بوده	1	\N	1	2026-06-05 21:06:41.295565+03:30
39d3108b-f018-48a9-a75f-a1668a9ff62e	b390282a-2e0f-4433-89f9-0b165925dbf7	4ca81bd5-7819-4682-bfd4-e0bb513ee061	R14	t	اوه مواد مخدر استفاده کردم شیشه و تریاک روش مصرفش خب هر کدوم فرق میکنه اگه مثلا شیشه خوراکی نیست که تریاک و خوراکیه نمیدونم اینو خودت تصمیم بگیر بعد مشروبات الکلی بله نوع مشروبات هم دست ساز بوده	1	\N	1	2026-06-05 21:06:41.295565+03:30
ab4fddcf-54e1-425b-b849-612ba3a11d68	b390282a-2e0f-4433-89f9-0b165925dbf7	0f8336e9-0747-4e54-a48e-099747936e52	Rd3	t	اوه مواد مخدر استفاده کردم شیشه و تریاک روش مصرفش خب هر کدوم فرق میکنه اگه مثلا شیشه خوراکی نیست که تریاک و خوراکیه نمیدونم اینو خودت تصمیم بگیر بعد مشروبات الکلی بله نوع مشروبات هم دست ساز بوده	3	\N	1	2026-06-05 21:06:41.295565+03:30
c3c0c489-eb4c-4dd9-b27b-5e27f73d023a	b390282a-2e0f-4433-89f9-0b165925dbf7	86ac4772-9391-434b-ab07-4c367e57f189	Rc4	f	\N	2	\N	0.5	2026-06-05 21:09:48.903737+03:30
62f2a4a2-d49c-4c95-afe5-c4e20f556996	b390282a-2e0f-4433-89f9-0b165925dbf7	49f2d313-1c96-40c4-b7f9-f3087433e8ab	X1	t	نمونه ادرار گرفته شده نمونه خون گرفته شده نمونه مو گرفته نشده نمونه ناخن گرفته شده	1	\N	1	2026-06-05 21:10:43.355692+03:30
f0894388-61f7-47d2-bc4e-22446dab63fb	b390282a-2e0f-4433-89f9-0b165925dbf7	ec393e54-806d-4dbb-8357-05ed680dfd4d	X2	t	نمونه ادرار گرفته شده نمونه خون گرفته شده نمونه مو گرفته نشده نمونه ناخن گرفته شده	1	\N	1	2026-06-05 21:10:43.355692+03:30
99f2efda-0c2d-47fd-996b-c5b9b7607a70	b390282a-2e0f-4433-89f9-0b165925dbf7	14620114-7ce1-4a4e-9c8d-684d9edd2b79	X3	t	نمونه ادرار گرفته شده نمونه خون گرفته شده نمونه مو گرفته نشده نمونه ناخن گرفته شده	0	\N	1	2026-06-05 21:10:43.355692+03:30
bba9cddd-693d-4834-a98c-aa1eca9fcd52	b390282a-2e0f-4433-89f9-0b165925dbf7	73bd57cf-06bc-43f6-9ced-4a9ad3c5d731	X4	t	نمونه ادرار گرفته شده نمونه خون گرفته شده نمونه مو گرفته نشده نمونه ناخن گرفته شده	1	\N	1	2026-06-05 21:10:43.355692+03:30
af0b453a-f008-4d5b-bc82-0e234a6c326a	b390282a-2e0f-4433-89f9-0b165925dbf7	3cb239f3-ce3a-4dd0-9515-b2bf5ff36eaf	R1	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	1	\N	1	2026-06-05 21:12:49.495675+03:30
6b03dedd-8e44-4570-b8a9-69d32c0bc1ca	b390282a-2e0f-4433-89f9-0b165925dbf7	c077810f-584a-4c72-95e5-d424df2aa02d	R2	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	15	\N	1	2026-06-05 21:12:49.495675+03:30
9ac19998-0d49-4ab2-83fe-672ce0c797b8	b390282a-2e0f-4433-89f9-0b165925dbf7	b417a360-eed3-446d-ae71-a396d332e9c8	R3	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	17	\N	1	2026-06-05 21:12:49.495675+03:30
8494d29d-a658-4654-b39b-a6101682c9eb	b390282a-2e0f-4433-89f9-0b165925dbf7	ddc94856-2b83-4920-9734-226e94c6cd28	R4	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	2	\N	1	2026-06-05 21:12:49.495675+03:30
6fb1e6ca-9125-4dea-853a-f60e0466aa97	b390282a-2e0f-4433-89f9-0b165925dbf7	26d0028d-9799-469c-84b2-7ea3df99a2cf	R5	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	3	\N	1	2026-06-05 21:12:49.495675+03:30
2e0ee0f1-8d86-4cff-823c-bfb4995aba71	b390282a-2e0f-4433-89f9-0b165925dbf7	4d589239-9e90-4ef6-85c1-57a01fe7226e	R9	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	0	\N	1	2026-06-05 21:12:49.495675+03:30
619fdb39-59a5-40fe-b080-8252df964cb0	b390282a-2e0f-4433-89f9-0b165925dbf7	1dc4059b-0154-4da8-9563-c2f840d6c40b	R10	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	1	\N	1	2026-06-05 21:12:49.495675+03:30
09da0313-a474-4f66-880a-8434a6ec2c3e	b390282a-2e0f-4433-89f9-0b165925dbf7	21621144-7b3e-4e4f-9f94-fa44f9f9c56a	R12	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	1	\N	1	2026-06-05 21:12:49.495675+03:30
9e16e05f-c2a3-4b83-a3d3-ac0127ca2b1b	b390282a-2e0f-4433-89f9-0b165925dbf7	1a9b51a3-a3e6-43a3-98fa-d88d7df91056	R8	t	۱۰۰ نخ و من کشیدم بعدش ۱۵ سالگی بوده به صورت منظم ۱۷ سالگی بعضی وقتا میکشم الان دیگه متوسط به صورت شبانه روزی سه بار میکشم متوقف هم که خب نکردم بعد داخل منزل نه داخل محل کار ولی آره تماس داشتم به جز سیگارم قلیون کشیدم	0	\N	1	2026-06-05 21:12:49.495675+03:30
c7a39efd-96ed-4aab-961a-3fe579aaa816	b390282a-2e0f-4433-89f9-0b165925dbf7	3d5615ae-8c93-4f80-a44f-8a560b186ef9	Rc3	f	اوه مواد مخدر استفاده کردم شیشه و تریاک روش مصرفش خب هر کدوم فرق میکنه اگه مثلا شیشه خوراکی نیست که تریاک و خوراکیه نمیدونم اینو خودت تصمیم بگیر بعد مشروبات الکلی بله نوع مشروبات هم دست ساز بوده	1,5	\N	1	2026-06-05 21:06:41.295565+03:30
295d09e0-2938-4fc2-ace1-1c86bbb0cfc5	b390282a-2e0f-4433-89f9-0b165925dbf7	225a3402-fa51-4acb-aa00-f92e49fd429f	A3	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	12	\N	1	2026-06-05 21:34:29.746982+03:30
e6513e82-ba86-4d4e-aee4-62f9fbbf31b9	b390282a-2e0f-4433-89f9-0b165925dbf7	2452c661-d7b0-449c-b195-fd5c2535cfd4	A5	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1382-01-01	\N	1	2026-06-05 21:34:29.746982+03:30
c2f4b3e8-47dc-4598-a7c6-b0f2dbf87f94	b390282a-2e0f-4433-89f9-0b165925dbf7	709f2980-dd13-4e1b-9d5e-e085a6c859d1	A26	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1	\N	1	2026-06-05 21:34:29.746982+03:30
f9166d3f-d183-4438-b255-48f9fde1129b	b390282a-2e0f-4433-89f9-0b165925dbf7	ccf0fe34-fa22-4d65-bd6f-1e80ee01a23c	A24	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	3	\N	1	2026-06-05 21:34:29.746982+03:30
5e1434ee-4adf-4ade-9c4f-4da81d3e8029	b390282a-2e0f-4433-89f9-0b165925dbf7	36f4c04c-d5f0-4753-8df4-3b3a80a5b10a	A28	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	2	\N	1	2026-06-05 21:34:29.746982+03:30
41ca457a-bcf6-4f1c-ad07-008760f0cc53	b390282a-2e0f-4433-89f9-0b165925dbf7	561e862a-6dc8-41fc-afef-917e5e54fdea	A30	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1	\N	1	2026-06-05 21:34:29.746982+03:30
227379ec-8f9a-4a0e-b1ba-917bcf99c75e	b390282a-2e0f-4433-89f9-0b165925dbf7	b440c4f2-6a34-4fc7-b085-1a2a88536cd9	A8	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1	\N	1	2026-06-05 21:34:29.746982+03:30
4a4bf692-ee11-4a0f-8c7c-4101a2115a83	b390282a-2e0f-4433-89f9-0b165925dbf7	361cb827-9e38-4e59-b533-b07ae6547507	A10	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1	\N	1	2026-06-05 21:34:29.746982+03:30
3b89d54f-a293-4184-bd6d-dda5ba035f1b	b390282a-2e0f-4433-89f9-0b165925dbf7	3e2f8377-187d-4673-b35a-a99012cbfc96	A20	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	16	\N	1	2026-06-05 21:34:29.746982+03:30
3dbc5052-fa5a-445c-a5fa-90f6bf46c7e6	b390282a-2e0f-4433-89f9-0b165925dbf7	70ce12a6-6cea-402e-82ea-4bf5df1da6f7	A21	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	5	\N	1	2026-06-05 21:34:29.746982+03:30
664c460e-73d5-4931-b4cc-72c001c3ebee	b390282a-2e0f-4433-89f9-0b165925dbf7	163e3f6c-10f2-4d18-a075-0b5fda2b13ba	A22	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	2	\N	1	2026-06-05 21:34:29.746982+03:30
6456ba5c-f3b5-460c-b60b-4651f1c3f4f2	b390282a-2e0f-4433-89f9-0b165925dbf7	03f334de-4be0-4933-a494-bed3614e3452	A27	t	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	15	\N	1	2026-06-05 21:34:29.746982+03:30
826da29f-92f6-483c-b14f-c6029dba4eb3	b390282a-2e0f-4433-89f9-0b165925dbf7	1d5c328a-da28-4835-9e42-75f7e6a6f5e5	C1	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	1	\N	1	2026-06-05 21:39:43.845237+03:30
6c7809a3-70be-4202-a118-50c2e364b8fa	b390282a-2e0f-4433-89f9-0b165925dbf7	5fa647ba-098b-4c8a-ac2f-7b0c5066e747	C4	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	4	\N	1	2026-06-05 21:39:43.845237+03:30
13c84e22-a2b8-448d-a3eb-10ae15ef56f8	b390282a-2e0f-4433-89f9-0b165925dbf7	5ad0d389-097e-400a-b467-b846035be505	C5	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	1	2026-06-05 21:39:43.845237+03:30
20f23c50-3633-4b15-9ddb-3087c758c177	b390282a-2e0f-4433-89f9-0b165925dbf7	624aad87-5908-43c1-9694-90c35507a002	C6	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	1	2026-06-05 21:39:43.845237+03:30
fa1b989a-470d-4f4b-a243-e16b1bb10d65	b390282a-2e0f-4433-89f9-0b165925dbf7	3154b405-c584-4a1a-9349-122e15405d2b	C7	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	1	2026-06-05 21:39:43.845237+03:30
e7ee87bd-b26b-4c24-82b6-238a6123741c	b390282a-2e0f-4433-89f9-0b165925dbf7	85a59913-7579-4529-9199-4f647fd531b2	B3	t	الو من ۱۸۰ سانتیمتر ۷۳ کیلو وزن دارم دور کمرم ۷۰ سانتیمتره دور باسنم ۴۵ و دور مچم ۱۵ سانتیمتره	70	\N	1	2026-06-05 21:29:13.166895+03:30
a806f445-8afd-46af-88a3-4a5f0f10e0c4	b390282a-2e0f-4433-89f9-0b165925dbf7	73da38df-4e92-4cb5-b70f-089a836bcff6	C8	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	1	\N	1	2026-06-05 21:39:43.845237+03:30
0fa20bc7-15d4-4ab3-9250-841e929d5365	b390282a-2e0f-4433-89f9-0b165925dbf7	bedfb7f3-db83-422f-bd7e-ccad476d954d	C9	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	1	\N	1	2026-06-05 21:39:43.845237+03:30
07945afa-9938-4954-9235-6d30fce3414e	b390282a-2e0f-4433-89f9-0b165925dbf7	cceb4d0f-7939-436d-8b17-48ebe0707801	C10	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	0.8	2026-06-05 21:39:43.845237+03:30
72369e45-aa11-4fb1-b1a1-45d3f48c77b3	b390282a-2e0f-4433-89f9-0b165925dbf7	39549bc0-326e-4a5e-b6be-812768fe8852	C11	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	1	2026-06-05 21:39:43.845237+03:30
38c79efc-bf2b-4b7a-99b3-b074e798e77e	b390282a-2e0f-4433-89f9-0b165925dbf7	aaa92a21-2ced-475a-aaff-ec81cb7f6e11	C24	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	1	\N	1	2026-06-05 21:39:43.845237+03:30
566d8de8-4614-449a-a637-e049c23d4194	b390282a-2e0f-4433-89f9-0b165925dbf7	1795b34d-6fcd-437a-aff9-551f48214882	C25	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	0	\N	1	2026-06-05 21:39:43.845237+03:30
9fb71120-1bb3-4e27-9dad-e81a125b059b	b390282a-2e0f-4433-89f9-0b165925dbf7	0b9fb3f7-57df-4a0d-b55f-e1e0b293531e	C26	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	1	\N	1	2026-06-05 21:39:43.845237+03:30
62ec5026-9b37-400c-aace-74db148e819d	b390282a-2e0f-4433-89f9-0b165925dbf7	68bb1133-1385-4325-8254-7c269e5ef805	C2	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	30	\N	0.9	2026-06-05 21:39:43.845237+03:30
2662a162-c467-4fc0-97c3-c7c848b43a0d	b390282a-2e0f-4433-89f9-0b165925dbf7	ae4cfb2e-651d-44dc-bf71-6535c771fe76	C3	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	2	\N	1	2026-06-05 21:39:43.845237+03:30
e74a9a83-d034-4fb3-9248-309118a98182	b390282a-2e0f-4433-89f9-0b165925dbf7	a6670484-ec02-4032-a76e-e189ddac7920	C23	t	ا خب من ملک شخصی داریم مترمربعش فکر میکنم ۳۰ متره یه دو اتاق داره چهار نفر زندگی میکنیم من و سه تا بچه هام فریزر جداگونه نداریم لباسشویی هم نه ظرفشویی هم که نه یه لپ‌تاپ دارم اینترنت دارم موتورسیکلت که نمیتونم سوار بشم مجاز نیست خودرو هم ندارم اسنپ باید بگیریم ا بعد یه ماشین اسباب بازی دارم سوار میشم دو تومن خریدمش بعد اینکه تعداد کتابای غیر درسی در یک سال گذشته فکر میکنم که پنج تا بوده بعد مسافرتای خارج از ایران تو کل عمرم یک بار بوده زیارتی نرفتم بعد تعداد مسافرتای غیر زیارتی هم یه بار بوده بعد تعداد مسافرتای داخل ایران ۱۰ سال گذشته خیلی بوده یادم نیست والا حدود ۴۰ ۵۰ بار شاید بوده	5	\N	0.9	2026-06-05 21:39:43.845237+03:30
59de51b0-6dd0-4729-ab43-44cec7caf1c6	b390282a-2e0f-4433-89f9-0b165925dbf7	b2ea01ef-67c9-4533-97c8-1318b0d01b8c	N2	t	من بیماری های خانوادگی که هست یک دیابت داشتیم فشار خون بوده بعد دیگه دیگه دیگه دیگه سردردهای مزمن یک کم آلزایمر اینا فردی از خانواده به این بیماری بله به اینا مبتلا هستن نسبتشون با من هم پدر بوده هم خواهر بوده بعد پدربزرگمان بوده	1	\N	1	2026-06-05 21:44:06.951507+03:30
9ed80aff-9bbe-4e9a-a9f2-eaf732ba2914	b390282a-2e0f-4433-89f9-0b165925dbf7	5c72be0b-57f7-4ca3-b186-9fb3f09b2079	N1	f	من بیماری های خانوادگی که هست یک دیابت داشتیم فشار خون بوده بعد دیگه دیگه دیگه دیگه سردردهای مزمن یک کم آلزایمر اینا فردی از خانواده به این بیماری بله به اینا مبتلا هستن نسبتشون با من هم پدر بوده هم خواهر بوده بعد پدربزرگمان بوده	1,2,18	\N	1	2026-06-05 21:44:06.951507+03:30
bf1c37d1-66fb-46dc-8c56-eaba34072f0a	b390282a-2e0f-4433-89f9-0b165925dbf7	fcbb2da9-e1d7-4b00-9b86-82a28a716f01	N3	f	من بیماری های خانوادگی که هست یک دیابت داشتیم فشار خون بوده بعد دیگه دیگه دیگه دیگه سردردهای مزمن یک کم آلزایمر اینا فردی از خانواده به این بیماری بله به اینا مبتلا هستن نسبتشون با من هم پدر بوده هم خواهر بوده بعد پدربزرگمان بوده	1	\N	1	2026-06-05 21:44:06.951507+03:30
29512dac-731f-4984-b05c-c63930e6564e	c8065e9e-882f-4e03-a548-6275347577d5	85a59913-7579-4529-9199-4f647fd531b2	B3	t	من یک و هشتادم بعدش وزنم ۶۷ کیلوئه دور کمرم ۳۴ سانت دور باسنم ۴۲ سانت دور مچم ۱۲۰ میلی‌متره	34	\N	1	2026-06-09 15:54:57.950147+03:30
2aa66271-5532-400c-bf89-02bf272e313c	c8065e9e-882f-4e03-a548-6275347577d5	8c525238-81fe-4039-875f-fae9f18f17bd	B4	t	من یک و هشتادم بعدش وزنم ۶۷ کیلوئه دور کمرم ۳۴ سانت دور باسنم ۴۲ سانت دور مچم ۱۲۰ میلی‌متره	42	\N	1	2026-06-09 15:54:57.950147+03:30
4662e15d-e729-4e75-b061-1e1ee640a7c0	c8065e9e-882f-4e03-a548-6275347577d5	db90c531-de99-4268-a47e-f98ae3b64806	B5	t	من یک و هشتادم بعدش وزنم ۶۷ کیلوئه دور کمرم ۳۴ سانت دور باسنم ۴۲ سانت دور مچم ۱۲۰ میلی‌متره	12	\N	1	2026-06-09 15:54:57.950147+03:30
b6d2d738-bdd9-4895-9dfa-3eb2b1461a3a	c8065e9e-882f-4e03-a548-6275347577d5	cb787f87-b5b0-495c-a2e6-cc6138ee49b1	B1	t	من یک و هشتادم بعدش وزنم ۶۷ کیلوئه دور کمرم ۳۴ سانت دور باسنم ۴۲ سانت دور مچم ۱۲۰ میلی‌متره	180	\N	1	2026-06-09 15:54:57.950147+03:30
a96b2ccb-6377-4ee6-a1fd-d64f2b594974	c8065e9e-882f-4e03-a548-6275347577d5	b348042c-70f8-4437-b367-fc4dab75e70c	B2	t	من یک و هشتادم بعدش وزنم ۶۷ کیلوئه دور کمرم ۳۴ سانت دور باسنم ۴۲ سانت دور مچم ۱۲۰ میلی‌متره	67	\N	1	2026-06-09 15:54:57.950147+03:30
e227ec18-3a1d-4846-8123-aeb144e7ec38	b390282a-2e0f-4433-89f9-0b165925dbf7	45565419-5aaa-44b3-b724-cbc08e837d83	U10	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	1	\N	1	2026-06-10 17:17:09.319194+03:30
03732e92-15b1-4ea5-be63-84f61346df35	b390282a-2e0f-4433-89f9-0b165925dbf7	3761d135-3e77-4a5f-a9b2-36553f488f00	U12	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	0	\N	1	2026-06-10 17:17:09.319194+03:30
24e86d99-8cd8-40ad-9c61-20bdf1158a0c	b390282a-2e0f-4433-89f9-0b165925dbf7	930f1c98-6083-4a95-b64c-06b3fec09dc2	U13	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	0	\N	1	2026-06-10 17:17:09.319194+03:30
bc8d487c-fa53-4754-94c7-f23524b685d0	b390282a-2e0f-4433-89f9-0b165925dbf7	9183d819-b263-4653-ab2c-34f2209b5e7d	U20	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	2	\N	1	2026-06-10 17:17:09.319194+03:30
c48bce3f-43f1-4848-9e51-3d6c18dd8ff0	b390282a-2e0f-4433-89f9-0b165925dbf7	bf0f4cc9-07df-456a-a501-4d24c4cf73b9	U21	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	2	\N	1	2026-06-10 17:17:09.319194+03:30
7d1592fd-8ecc-4eac-b611-57f42759b650	b390282a-2e0f-4433-89f9-0b165925dbf7	b6b1419a-6c82-4efd-b714-ae4f011ce0dc	U43	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	1	\N	1	2026-06-10 17:17:09.319194+03:30
7af5267c-be5d-4fc6-ae47-51d28386d44a	b390282a-2e0f-4433-89f9-0b165925dbf7	81de0808-1c6f-4f79-9d1a-52ee4e9d11a9	U2	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	3	\N	1	2026-06-10 17:17:09.319194+03:30
4c79b1ee-7b67-4901-a6f1-29b279e76df3	b390282a-2e0f-4433-89f9-0b165925dbf7	cbfbc49c-1aeb-4d7f-8c10-3ee11eed6a75	Ma3	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	1	\N	1	2026-06-09 16:07:16.040195+03:30
3d578613-ec1b-4ba9-8c33-20836d62d481	b390282a-2e0f-4433-89f9-0b165925dbf7	66c04e6e-b9cc-4d49-907a-7bfe75c7c96b	T5	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	100	\N	1	2026-06-10 17:17:09.319194+03:30
1091bc9a-1ff8-4162-9762-0a14d2ee5b40	b390282a-2e0f-4433-89f9-0b165925dbf7	38c9d2f3-fec7-4122-ac75-19cc9db34280	T18	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	50	\N	0.9	2026-06-10 17:17:09.319194+03:30
ddc60a48-51aa-46a7-ba6b-0d71e5841def	b390282a-2e0f-4433-89f9-0b165925dbf7	52044ed7-8776-41b1-88c3-4c7b96bda565	T113	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	4	\N	1	2026-06-10 17:17:09.319194+03:30
64ac0543-3da7-4b3c-b102-9d18cf5f2680	b390282a-2e0f-4433-89f9-0b165925dbf7	7993e427-00d6-4f99-98f8-c06f61683601	U1	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	1	\N	1	2026-06-10 17:17:09.319194+03:30
ddf137cf-4f17-4a41-b210-608737127003	b390282a-2e0f-4433-89f9-0b165925dbf7	9579cbd0-4aad-4982-8b91-f7ad72107c62	U3	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	1	\N	1	2026-06-10 17:17:09.319194+03:30
f52ea88a-6ef9-4033-80ba-144a09c01183	b390282a-2e0f-4433-89f9-0b165925dbf7	1e570771-c319-4b10-93a8-3e227c25db17	U4	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	3	\N	1	2026-06-10 17:17:09.319194+03:30
1454fabf-2448-4a6c-be03-500cb9e6aa77	b390282a-2e0f-4433-89f9-0b165925dbf7	e3795fe6-ceff-4232-82e1-ef992ef8a092	U5	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	3	\N	1	2026-06-10 17:17:09.319194+03:30
4e716b73-aa1e-4050-b63e-ea4ad9d2fc07	b390282a-2e0f-4433-89f9-0b165925dbf7	47430cd8-44ce-4275-9c0e-13df6a26adb2	U9	t	امم برنج پخته ۱۰۰ گرم در روز میخورم تخم مرغ یه دونه تخم مرغ میخورم هر شب نمک در روز حدود ۴ گرم سه وعده میخورم صبحانه ناهار شام به غذای خودم نمک اضافه نمیکنم غذا کم نمکه بعد کبابی یک تا سه بار در هفته سرخ شده یک در یک تا سه بار در هفته از روغن مایع استفاده میکنیم پس از سرخ کردن دوباره استفاده میکنم اگه کفک بزنه استفاده نمیکنم دودی استفاده نمیکنم چای و قهوه و گرم میخورم سوپ و میدونم رو گرم میخورم بعضی وقتا دمنوش میخورم	3	\N	1	2026-06-10 17:17:09.319194+03:30
cf8f0a4c-e38e-4a72-9096-c8c576e72b30	b390282a-2e0f-4433-89f9-0b165925dbf7	f7d49ffe-b38c-4106-b312-a088021610bb	A4	f	خب امروز هستش ۵ ۴۴۰۵ مرکز شهر کرد جنسیت هم زنه تاریخ تولدم ۱۳۸۲ هست ۲۶ ۵ قومیت مادر فارس پدر فارس سال تحصیلیم ۱۲ سال مدرسه بودم ۴ سالم دانشگاه بعد آخرین مدرک تحصیلیم لیسانس موقعیت من من مادرم وضعیت تاهل همسر مرحوم بعد اینکه یه بار ازدواج کردم تو سن ۱۶ سالگی یا ۱۵ سالگی ۱۵ سالگی بود فکر میکنم آره ازدواج فامیلی نبوده نوع محل سکونتم شهریه	1	\N	1	2026-06-05 21:34:29.746982+03:30
6c74e464-0a5c-43d6-8722-16171aef82f6	b390282a-2e0f-4433-89f9-0b165925dbf7	8c525238-81fe-4039-875f-fae9f18f17bd	B4	t	الو من ۱۸۰ سانتیمتر ۷۳ کیلو وزن دارم دور کمرم ۷۰ سانتیمتره دور باسنم ۴۵ و دور مچم ۱۵ سانتیمتره	45	\N	1	2026-06-05 21:29:13.166895+03:30
34b3d489-1557-4e73-af7e-fb13b647632a	b390282a-2e0f-4433-89f9-0b165925dbf7	db1d307a-ddd7-4638-b783-e072f702aded	Q3	t	من دو بار در روز مسواک میزنم. ۳۰ تا دندون دارم. دو تاشو کشیدم. یه دونه‌ش خرابه الان. دو تاشو پر کردم. زخم دهان دارم. نخ دندون استفاده نمیکنم من. دنده مصنوعی هم ندارم. دهانشویه استفاده نمیکنم.	1	\N	1	2026-06-05 21:15:13.20541+03:30
32a51d0b-47c0-46fb-ba36-0e9151c78bd6	b390282a-2e0f-4433-89f9-0b165925dbf7	d9353cbc-3658-42b2-9038-d96ae5977b50	Q2	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	33	\N	1	2026-06-05 21:15:13.20541+03:30
6b9d82cb-daca-4df6-bd06-0ec52e38565a	b390282a-2e0f-4433-89f9-0b165925dbf7	88df1ae3-2b24-47d0-8142-4a260efe79d3	Q5	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	1	\N	1	2026-06-05 21:15:13.20541+03:30
6ff32e7c-d8b9-45b0-9c05-b075d796e4ee	b390282a-2e0f-4433-89f9-0b165925dbf7	08d63107-8105-40ca-a8e1-61cf92a9bcad	Q6	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	0	\N	1	2026-06-05 21:15:13.20541+03:30
886bd217-9c3e-4087-b221-111f733a3d47	b390282a-2e0f-4433-89f9-0b165925dbf7	da3db86f-af2e-4e2a-b515-43fcf93a681c	Q1	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	5	\N	1	2026-06-05 21:15:13.20541+03:30
127e1470-3c13-4077-bee7-6bf591b228c3	b390282a-2e0f-4433-89f9-0b165925dbf7	230dfb2c-b6f9-4ae9-aa6f-38eff28ac220	Ma1	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	1	\N	1	2026-06-09 16:07:16.040195+03:30
2061176b-cd29-419d-b734-2ac67a85b3e6	b390282a-2e0f-4433-89f9-0b165925dbf7	3013b11b-e74e-455f-b6d6-026836cd553b	M2	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	1	\N	1	2026-06-09 16:07:16.040195+03:30
6a391a8a-9d1c-4a5c-b596-ded84ca42d08	b390282a-2e0f-4433-89f9-0b165925dbf7	6dce5766-5b9b-4385-ad6d-618bf197bd1b	Ma2	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	0	\N	1	2026-06-09 16:07:16.040195+03:30
8f8c3a32-1c73-4fae-8c5b-c85e9bbe169e	b390282a-2e0f-4433-89f9-0b165925dbf7	a8af94b3-c801-4aa7-9eb4-35719b016884	M1	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	قرص کافئین, لوزارتون	\N	1	2026-06-09 16:07:16.040195+03:30
9ac7dc0b-8103-4d68-b0b2-93dbe96025a3	b390282a-2e0f-4433-89f9-0b165925dbf7	66a040dd-681d-437e-bea9-1f9a155b4f76	Ma4	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	0	\N	1	2026-06-09 16:07:16.040195+03:30
c64ed738-97c4-4ba7-9052-23d5e9bc1aec	b390282a-2e0f-4433-89f9-0b165925dbf7	2c9583d7-71f8-408b-9f98-3261b7e456f4	Q7	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	1	\N	1	2026-06-05 21:15:13.20541+03:30
dbcbb8da-014e-4117-8596-f22d7613822d	b390282a-2e0f-4433-89f9-0b165925dbf7	7d0584cc-4883-4bd5-8df7-b270f1e40fb8	Q9	t	خب من مسواک نمی‌زنم من ۳۳ تا دندون دارم یه دونه دندونم پر کردم یه دونه‌ش الان خرابه دیگه زخم دهون ندارم نخ دندون استفاده می‌کنم هر روز استفاده می‌کنم داخل هفته دیگه دندون مصنوعی که گفتم ندارم دهانشویه آره استفاده می‌کنم	0	\N	1	2026-06-05 21:15:13.20541+03:30
b95c4016-b1bf-4b74-9060-36714ede60ac	b390282a-2e0f-4433-89f9-0b165925dbf7	3d4f2c0d-1c72-4c78-9131-90af54df3806	M3	t	خب من یه قرص کافئین میخورم روز یکی بعد یه لوزارتون میخورم دیگه دیگه چی میخورم همینا مصرف تعداد دفعات هم روزانه است دیگه فشار خون بله دیابت و خوراکی که خیر انسولین استفاده میکنم استاتینا نمیدونم چیان اصلا	1	\N	1	2026-06-09 16:07:16.040195+03:30
\.


--
-- TOC entry 4984 (class 0 OID 16438)
-- Dependencies: 224
-- Data for Name: sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sections (section_id, form_id, section_key, name_fa, sort_order, depends_on_vcode, depends_on_value, skip_if_vcode, skip_if_value) FROM stdin;
11111111-1111-1111-1111-111111111111	f47ac10b-58cc-4372-a567-0e02b2c3d479	identity	مشخصات فردی	1	\N	\N	\N	\N
22222222-2222-2222-2222-222222222222	f47ac10b-58cc-4372-a567-0e02b2c3d479	socioeconomic	وضعیت اجتماعی اقتصادی	2	\N	\N	\N	\N
33333333-3333-3333-3333-333333333333	f47ac10b-58cc-4372-a567-0e02b2c3d479	lifestyle	سبک زندگی (آب و تغذیه)	3	\N	\N	\N	\N
44444444-4444-4444-4444-444444444444	f47ac10b-58cc-4372-a567-0e02b2c3d479	medical_history	سابقه بیماری‌های مزمن	4	\N	\N	\N	\N
55555555-5555-5555-5555-555555555555	f47ac10b-58cc-4372-a567-0e02b2c3d479	medications	داروهای مصرفی	5	\N	\N	\N	\N
66666666-6666-6666-6666-666666666666	f47ac10b-58cc-4372-a567-0e02b2c3d479	family_history	سابقه بیماری خانوادگی	6	\N	\N	\N	\N
88888888-8888-8888-8888-888888888888	f47ac10b-58cc-4372-a567-0e02b2c3d479	anthropometry	تن‌سنجی (قد و وزن)	8	\N	\N	\N	\N
99999999-9999-9999-9999-999999999999	f47ac10b-58cc-4372-a567-0e02b2c3d479	nutrition_ffq	بسامد مصرف خوراک (FFQ)	9	\N	\N	\N	\N
aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa	f47ac10b-58cc-4372-a567-0e02b2c3d479	physical_activity	فعالیت فیزیکی	10	\N	\N	\N	\N
bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb	f47ac10b-58cc-4372-a567-0e02b2c3d479	sleep_habits	الگوی خواب	11	\N	\N	\N	\N
cccccccc-cccc-cccc-cccc-cccccccccccc	f47ac10b-58cc-4372-a567-0e02b2c3d479	oral_health	بهداشت دهان و دندان	12	\N	\N	\N	\N
dddddddd-dddd-dddd-dddd-dddddddddddd	f47ac10b-58cc-4372-a567-0e02b2c3d479	smoking	مصرف دخانیات	13	\N	\N	\N	\N
eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee	f47ac10b-58cc-4372-a567-0e02b2c3d479	alcohol_drugs	الکل و مواد مخدر	14	\N	\N	\N	\N
ffffffff-ffff-ffff-ffff-ffffffffffff	f47ac10b-58cc-4372-a567-0e02b2c3d479	blood_pressure	اندازه‌گیری فشار خون	15	\N	\N	\N	\N
10101010-1010-1010-1010-101010101010	f47ac10b-58cc-4372-a567-0e02b2c3d479	biological_samples	نمونه‌های بیولوژیک	16	\N	\N	\N	\N
77777777-7777-7777-7777-777777777777	f47ac10b-58cc-4372-a567-0e02b2c3d479	reproductive	تاریخچه باروری (زنان)	7	A4	2	\N	\N
\.


--
-- TOC entry 4985 (class 0 OID 16449)
-- Dependencies: 225
-- Data for Name: submissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.submissions (submission_id, user_id, form_id, status, created_at, updated_at) FROM stdin;
c8065e9e-882f-4e03-a548-6275347577d5	47e655a5-c4a5-46aa-9f98-6f3ae899e3ab	f47ac10b-58cc-4372-a567-0e02b2c3d479	draft	2026-06-09 15:44:19.619671+03:30	2026-06-09 15:44:19.619671+03:30
b390282a-2e0f-4433-89f9-0b165925dbf7	198cc242-3c61-4dc1-9677-252bea4e3d81	f47ac10b-58cc-4372-a567-0e02b2c3d479	draft	2026-06-05 21:04:35.723296+03:30	2026-06-10 17:19:09.956106+03:30
\.


--
-- TOC entry 4986 (class 0 OID 16459)
-- Dependencies: 226
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, first_name, last_name, national_code, phone_number, role, created_at) FROM stdin;
47e655a5-c4a5-46aa-9f98-6f3ae899e3ab	خلی	کلی	4011277143	09380033550	1	2026-06-09 15:44:19.619671+03:30
198cc242-3c61-4dc1-9677-252bea4e3d81	سبحان	عسکری	4011277144	09380033555	2	2026-06-05 21:04:35.723296+03:30
\.


--
-- TOC entry 4809 (class 2606 OID 16468)
-- Name: api_logs api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_pkey PRIMARY KEY (log_id);


--
-- TOC entry 4811 (class 2606 OID 16470)
-- Name: forms forms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (form_id);


--
-- TOC entry 4813 (class 2606 OID 16472)
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (question_id);


--
-- TOC entry 4815 (class 2606 OID 16474)
-- Name: questions questions_v_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_v_code_key UNIQUE (v_code);


--
-- TOC entry 4817 (class 2606 OID 16476)
-- Name: responses responses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_pkey PRIMARY KEY (response_id);


--
-- TOC entry 4819 (class 2606 OID 16478)
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (section_id);


--
-- TOC entry 4821 (class 2606 OID 16480)
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (submission_id);


--
-- TOC entry 4823 (class 2606 OID 16482)
-- Name: users users_national_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_national_code_key UNIQUE (national_code);


--
-- TOC entry 4825 (class 2606 OID 16484)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4826 (class 2606 OID 16485)
-- Name: api_logs api_logs_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(submission_id);


--
-- TOC entry 4827 (class 2606 OID 16490)
-- Name: questions questions_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.sections(section_id) ON DELETE CASCADE;


--
-- TOC entry 4828 (class 2606 OID 16495)
-- Name: responses responses_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(question_id) ON DELETE CASCADE;


--
-- TOC entry 4829 (class 2606 OID 16500)
-- Name: responses responses_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.responses
    ADD CONSTRAINT responses_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(submission_id) ON DELETE CASCADE;


--
-- TOC entry 4830 (class 2606 OID 16505)
-- Name: sections sections_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(form_id) ON DELETE CASCADE;


--
-- TOC entry 4831 (class 2606 OID 16510)
-- Name: submissions submissions_form_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(form_id) ON DELETE CASCADE;


--
-- TOC entry 4832 (class 2606 OID 16515)
-- Name: submissions submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


-- Completed on 2026-07-27 16:59:50

--
-- PostgreSQL database dump complete
--

\unrestrict fIqWNmH2OgQRencfkC6CkUKXzvnR9wLJgLzveYDf25tR2axCRuVuTYZi1Pkd72Y

