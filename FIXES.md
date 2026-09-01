- [x] Update Qestions texts
- [ ] Reduce the number of Questions in chronic disease section
- [x] Find proxy for Gemini (WebShare) 
- [x] pill names more than one fix (داروهای مصرفی)
- [x] Fix group pair sort_order
- [x] Fix counter of the visible rule questions 
- [x] make the question text applicable as static   
- [x] order forms 
-- Form ordering
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE public.forms SET sort_order = 1 WHERE category = 'general';
UPDATE public.forms SET sort_order = 2 WHERE category = 'nutrition';
UPDATE public.forms SET sort_order = 3 WHERE category = 'medical';

- [x] health auto check UI fixed(untested)(only need to do is_required questions -> make the all required??)
- [ ] test vitamin pills tracker
- [ ] convert income source into one multi select q
- [x] Make med history as one multi select q +  هیچ کدام option 
- [ ] Add q "do you use any meds/pills" At top with visibility and conditional
- [ ] delete "lab", others sections from db
- [ ] fix Sanity check is doing Advice? we need it just to check to make sure the 
user said the right answer. 
- [ ] go to dashboard after submission 
- [ ] get the fonts and other stuff for UI offline
- [x] ask for age instead of birthdate
- [ ] visibility_check between forms
- [ ] هیچکدام option should disable the other options (small bug)