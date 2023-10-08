import { Accordion, AccordionButton, AccordionItem, AccordionPanel, Box, Button, Divider, FormControl, FormHelperText, FormLabel, HStack, Heading, Input, Menu, MenuButton, MenuItem, MenuList, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Spinner, Stack, Tab, TabList, TabPanel, TabPanels, Tabs, Text, Textarea, Tooltip, VStack, useDisclosure, useMediaQuery, useToast } from "@chakra-ui/react";
import GoogleMapsView from "./Map";
import { useEffect, useState } from "react";
import { RedirectToSignIn, RedirectToSignUp, RedirectToUserProfile, SignIn, SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from '../convex/_generated/api';
import { useNavigate } from "react-router-dom";
import { toPoint as mgrsToWgs } from 'mgrs';
import Icon from "@mdi/react";
import { mdiHelpCircle, mdiPlusCircle } from "@mdi/js";
import validator from 'validator';


export function Home() {
  interface FormState {
    name: string;
    description: string;
    mgrs: string;
    details: string;
    ownership: string;
    emails: string[];
    webhooks: string[];
  }

  const [formState, setFormState] = useState<FormState>({
    name: '',
    description: '',
    // Starts at SF Bay Area
    mgrs: '10SEG',
    details: '',
    ownership: '',
    emails: [],
    webhooks: [],
  });
  const [blockSubmit, setBlockSubmit] = useState(true);
  const [step, setStep] = useState(0);
  const [formLoading, setFormLoading] = useState(false);
  const [createResponse, setCreateResponse] = useState<{ signingSecret?: string, trackerId?: string} | null>(null);

  const isMd = useMediaQuery("(max-width: 1040px)")[0];
  const { isAuthenticated } = useConvexAuth();
  const mutation = useMutation(api.main.createTracker);
  const toast = useToast();

  type KeyType = 'name' | 'description' | 'mgrs' | 'details' | 'ownership' | 'emails' | 'webhooks';
  function updateForm(key: KeyType, value: any) {
    setFormState({
      ...formState,
      [key]: value
    });
  }

  function reset() {
    setFormState({
      name: '',
      description: '',
      mgrs: '',
      details: '',
      ownership: '',
      emails: [],
      webhooks: [],
    });
    setStep(0);
    setBlockSubmit(true);
    setFormLoading(false);
  }

  // validation functions are annoyingly long and repetitive D:
  function formValidate(suppress = true): boolean {
    function fail(title: string, description: string) {
      if (suppress) return;
      toast({
        title,
        description,
        status: 'error',
        duration: 9000,
        isClosable: true,
      })
    }

    if (!formState.name) {
      fail('Invalid Name', 'Please enter a name for your tracker.')
      return false;
    }

    if (!formState.mgrs) {
      fail('Invalid MGRS', 'Please enter a 5-character MGRS for your tracker.')
      return false;
    }

    if (formState.mgrs.length !== 5) {
      fail('Invalid MGRS', 'Only 100km resolution MGRS are supported at this time. Your MGRS must be 5 characters long.')
      return false;
    }

    // Make sure the MGRS is valid
    try {
      const coords = mgrsToWgs(formState.mgrs);
      if (!coords || !coords[0] || !coords[1]) {
        fail('Invalid MGRS', 'Please enter a valid MGRS.')
        return false;
      }
    } catch {
      fail('Invalid MGRS', 'Please enter a valid MGRS.')
      return false;
    }

    if (!suppress) {
      for (const email of formState.emails) {
        if (!validator.isEmail(email)) {
          fail('Invalid Email', `${email} is invalid.`)
          return false;
        }
      }
  
      for (const webhook of formState.webhooks) {
        if (!validator.isURL(webhook)) {
          fail('Invalid Webhook', `${webhook} is invalid.`)
          return false;
        }
      }
  
    }
    
    return true;
  }

  async function submit() {
    if (!formValidate()) return;
    setFormLoading(true);

    const res = await mutation({
      name: formState.name,
      description: formState.description,
      mgrs: formState.mgrs,
      detailInterest: formState.details,
      propertyOwnership: formState.ownership,
      emails: formState.emails,
      webhookTargets: formState.webhooks,
    });

    if (res.code !== 200) {
      toast({
        title: 'Error',
        description: res.message,
        status: 'error',
        duration: 9000,
        isClosable: true,
      });
    }

    
    setFormLoading(false);
    const { trackerId, signingSecret } = res;
    setCreateResponse({ trackerId, signingSecret });
    reset();
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    setBlockSubmit(!formValidate());
  }, [formState]);

  // TODO
  function TutorialModal() {
    const { isOpen, onOpen, onClose } = useDisclosure();
    
    return(
      <Modal isOpen={isOpen} onClose={onClose}>

      </Modal>
    )
  }

  function ConfirmModal() {
    const { isOpen, onOpen, onClose } = useDisclosure();

    function onClick() {
      if (!formValidate(false)) return;
      onOpen();
    }

    function onSubmitClick() {
      submit();
      onClose();
    }

    return (
      <>
        <Button colorScheme="green" onClick={onClick} isDisabled={blockSubmit}>Create Tracker</Button>
        <Modal isOpen={isOpen} onClose={onClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{ isAuthenticated ? 'Conirm' : 'Sign in' }</ModalHeader>
            <ModalCloseButton />

            <ModalBody>
              <SignedOut>
                <SignIn />
              </SignedOut>

              <SignedIn>
                <Text>Are you sure you want to create this tracker?</Text>

                {
                  (formState.emails.length === 0 && formState.webhooks.length === 0) && (
                    <Text color="orange">
                      You haven't added any notification methods. You won't be notified when new information is available.
                    </Text>
                  )
                }

                <ModalFooter>
                  <Button onClick={onClose} mr={4}>Cancel</Button>
                  <Button onClick={onSubmitClick} colorScheme="green">Create</Button>
                </ModalFooter>
              </SignedIn>
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    )
  }

  if (formLoading) return ( <LoadingPage /> );

  return (
    <VStack minH="100vh" p={8} align="center">

      {
        createResponse && (
          <Box
            bg="green.50"
            color="green.700"
            p={4}
            borderRadius={8}
            mb={8}
            w="100%"
          >
            <Heading size="md">Success!</Heading>
            <Text>
              Your tracker has been created. You can view it under the "My Trackers" screen uner the account dropdown.
            </Text>
            <Text>
              Your webhook signing secret is <code>{createResponse.signingSecret}</code>.
              When you receive a webhook notification, you can verify it by checking that the <code>signing-secret</code>
              &nbsp;header matches what's above.
            </Text>

            <Text color="red.500" fontWeight="bold">
              Copy the signing secret down somewhere safe. You will not be able to view it again.
            </Text>
          </Box>
        )
      }

      <Stack spacing={10} direction={isMd ? 'column' : 'row'}>
        {/* Form */}
        <VStack align="start">
          <Heading>
            {
              formState.name ? (
                formState.name
              ) : (
                'Create a Tracker'
              )
            }
          </Heading>

          { 
            step === 0 && (
              <>
              <Heading size="sm">Step 1: Tracker Info</Heading>
              <Divider />

              <Text fontStyle="bold">Name</Text>
              <Input
                value={formState.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Name"
              />

              <Text fontStyle="bold">Description</Text>
              <Textarea
                value={formState.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Description"
              />


              <FormControl>
                <FormLabel fontStyle="bold">
                  <HStack>
                    <Text>
                      MGRS
                    </Text>
                    <Tooltip label="Military Grid Reference System" aria-label="Military Grid Reference System" placement="top">
                      <a href="https://en.wikipedia.org/wiki/Military_Grid_Reference_System" target="_blank" rel="noreferrer">
                        <Icon path={mdiHelpCircle} size={1} color="gray.500" className="cursor-pointer hover:fill-blue-500" />
                      </a>
                    </Tooltip>
                  </HStack>
                </FormLabel>

                <Input
                  value={formState.mgrs}
                  onChange={(e) => updateForm('mgrs', e.target.value)}
                  placeholder="MGRS"
                />

                <FormHelperText>
                  Only five-character (100km resolution) MGRS are supported at this time.
                </FormHelperText>

              </FormControl>

              <Text fontStyle="bold">Anything in particular you're looking for?</Text>
              <Textarea
                value={formState.details}
                onChange={(e) => updateForm('details', e.target.value)}
                placeholder="Forest Health, Snowmelt, etc."
              />

              <Text fontStyle="bold">Who is responsible for this property?</Text>
              <Textarea
                value={formState.ownership}
                onChange={(e) => updateForm('ownership', e.target.value)}
                placeholder="For instance, the city, a private company, etc. This helps me find relevant information."
              />

              <Button colorScheme="blue" isDisabled={blockSubmit} onClick={() => setStep(1)}>Next</Button>
              </>
              
            )
          }

          {
            step === 1 && (
              <>
              <Heading size="sm">Step 2: Notifications</Heading>
              <Divider />

              <Heading size="sm">Emails</Heading>
              <Button colorScheme="cyan" onClick={() => updateForm('emails', [...formState.emails, ''])} minW="sm">
                Add Email
                &nbsp;
                <Icon path={mdiPlusCircle} size={1} />
              </Button>

              {
                formState.emails.map((email, i) => (
                  <HStack key={i}>
                    <Input
                      value={email}
                      onChange={(e) => {
                        const newEmails = [...formState.emails];
                        newEmails[i] = e.target.value;
                        updateForm('emails', newEmails);
                      }}
                      placeholder="Email"
                    />
                    <Button colorScheme="red" onClick={() => {
                      const newEmails = [...formState.emails];
                      newEmails.splice(i, 1);
                      updateForm('emails', newEmails);
                    }}>Remove</Button>
                  </HStack>
                ))
              }

              <Text fontStyle="bold">Webhooks</Text>
              <Button colorScheme="cyan" onClick={() => updateForm('webhooks', [...formState.webhooks, ''])} minW="sm">
                Add Webhook
                &nbsp;
                <Icon path={mdiPlusCircle} size={1} />
              </Button>

              {/* DRY 😭 */}
              {
                formState.webhooks.map((webhook, i) => (
                  <HStack key={i}>
                    <Input
                      value={webhook}
                      onChange={(e) => {
                        const newWebhooks = [...formState.webhooks];
                        newWebhooks[i] = e.target.value;
                        updateForm('webhooks', newWebhooks);
                      }}
                      placeholder="Webhook"
                    />
                    <Button colorScheme="red" onClick={() => {
                      const newWebhooks = [...formState.webhooks];
                      newWebhooks.splice(i, 1);
                      updateForm('webhooks', newWebhooks);
                    }}>Remove</Button>
                  </HStack>
                ))
              }

              <Button colorScheme="blue" onClick={() => setStep(0)}>Back</Button>
              <ConfirmModal />
              </>
            )
          }
        </VStack>

        <GoogleMapsView mgrs={formState.mgrs} />
      </Stack>
    </VStack>
  )
}

export function LoadingPage() {
  return (
    <HStack minH="100vh" p={8} align="center">
      <Spinner />
      <Text className="animate-pulse">
        Loading...
      </Text>
    </HStack>
  )
}

export function AuthPage({ fn } : { fn: 'sign-in' | 'sign-up' | 'settings' }) {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn && fn !== 'settings') {
      navigate('/');
    }
  }, [isLoaded, isSignedIn])

  return (
    <>
      {
        fn === 'sign-in' ? (
          <RedirectToSignIn />
        ) : fn === 'sign-up' ? (
          <RedirectToSignUp />
        ) : fn === 'settings' ? (
          <RedirectToUserProfile />
        ) : (
          <RedirectToSignIn />
        )
      }
      <LoadingPage />
    </>
  )
}

export default function MyTrackers() {

  /*
  export default defineSchema({
  trackers: defineTable({
    id: v.string(),
    accountId: v.string(),
    name: v.string(),
    description: v.string(),
    location: v.object({
      lat: v.number(),
      lng: v.number(),
    }),
    radius: v.number(),
    emails: v.array(v.object({
      email: v.string(),
      verified: v.boolean(),
    })),
    webhookTargets: v.array(v.string()),
    signingSecret: v.string(),
  }),
  trackerEvents: defineTable({
    id: v.string(),
    trackerId: v.string(),
    eventType: v.string(),
    eventData: v.any(), // TODO: define this
    gpt4Response: v.any(), // TODO: define this
  }),
});
*/

  const navigate = useNavigate();
  const trackersQ = useQuery(api.main.getUserTrackers);
  const yoloAction = useAction(api.nodeactions.checkHLS);

  async function lmao(trackerId: string) {
    const res = await yoloAction({ trackerId });
    console.log(res);
  }

  if (!trackersQ || !trackersQ.trackers) {
    return (
      <LoadingPage />
    )
  }

  return (
    <VStack minH="100vh" align="start" p={8}>
      <Heading size="xl">My Trackers</Heading>
      <Divider />
      {
        trackersQ.trackers?.length === 0 ? (
          <>
            <Heading size="4xl">😅</Heading>
            <Text fontSize="lg">You haven't made any trackers yet!</Text>
            <Text fontSize="lg">Click the button below to get started.</Text>
            <Button colorScheme="green" onClick={() => navigate('/')}>Create a Tracker</Button>
          </>
        ) : (
          <Accordion allowToggle>
            {
              trackersQ.trackers.map((tracker, i) => (
                <AccordionItem key={i}>
                  <AccordionButton>
                    <Heading size="sm">{tracker.name}</Heading>
                  </AccordionButton>
                  <AccordionPanel>
                    <Text>{tracker.description}</Text>
                    <HStack>
                      <Button colorScheme="blue">Edit</Button>
                      <Button colorScheme="red">Delete</Button>
                      <Button colorScheme="green" onClick={() => lmao(tracker.id)}>Test</Button>
                    </HStack>
                  </AccordionPanel>
                </AccordionItem>
              ))
            }
          </Accordion>
        )
      }
    </VStack>
  )
}
